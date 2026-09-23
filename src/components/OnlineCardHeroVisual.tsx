import Image from "next/image";
import { useId } from "react";
import styles from "./OnlineCardMinimal.module.css";

const chartBars = [
  { x: 48, y: 207 },
  { x: 112, y: 189 },
  { x: 176, y: 167 },
  { x: 240, y: 139 },
  { x: 304, y: 101 },
  { x: 368, y: 59 },
];
const chartLine = "M24 216 L88 192 L146 198 L218 143 L279 155 L348 101 L426 39";

export function OnlineCardHeroVisual() {
  const chartId = useId();

  return (
    <div className={styles.heroScene} aria-hidden="true">
      <svg className={styles.heroChart} viewBox="0 0 460 260" fill="none" focusable="false">
        <defs>
          <linearGradient id={`${chartId}-bar`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#b6ecff" stopOpacity=".3" />
            <stop offset="1" stopColor="#69bfdf" stopOpacity=".04" />
          </linearGradient>
          <linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#83daf7" stopOpacity=".12" />
            <stop offset="1" stopColor="#83daf7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${chartId}-line`} x1="24" y1="216" x2="426" y2="39" gradientUnits="userSpaceOnUse">
            <stop stopColor="#75c6df" stopOpacity=".25" />
            <stop offset="1" stopColor="#c5f1ff" stopOpacity=".85" />
          </linearGradient>
        </defs>
        <path d="M24 82H432 M24 134H432 M24 186H432 M24 238H432" stroke="#bcecff" strokeOpacity=".07" />
        <path d={`${chartLine} V238 H24Z`} fill={`url(#${chartId}-area)`} />
        {chartBars.map(({ x, y }) => (
          <g key={x}>
            <rect x={x} y={y} width="34" height={238 - y} rx="3" fill={`url(#${chartId}-bar)`} stroke="#aae5fa" strokeOpacity=".22" />
            <path d={`M${x} ${y} l8 -6 h34 l-8 6Z`} fill="#c8f0ff" fillOpacity=".18" />
            <path d={`M${x + 34} ${y} l8 -6 V232 l-8 6Z`} fill="#70c2df" fillOpacity=".1" />
          </g>
        ))}
        <path className={styles.heroChartLine} d={chartLine} stroke={`url(#${chartId}-line)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="426" cy="39" r="8" fill="#b8eeff" fillOpacity=".08" />
        <circle cx="426" cy="39" r="3" fill="#c5f1ff" fillOpacity=".9" />
      </svg>
      <Image
        src="/icons/bohemika-chrome-symbol.png"
        alt=""
        fill
        sizes="(max-width: 760px) 60px, (max-width: 1000px) 220px, 300px"
        preload
        draggable={false}
      />
    </div>
  );
}
