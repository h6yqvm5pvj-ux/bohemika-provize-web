import { useId } from "react";
import { CuzkHouse } from "./CuzkHouse";
import styles from "./cuzkPropertyMap.module.css";

export function CuzkPropertyMap({ className, animated = false }: { className?: string; animated?: boolean }) {
  const id = useId();
  return (
      <svg className={`${styles.map} ${className ?? ""}`} data-animated={animated} viewBox="0 0 520 470" fill="none" aria-hidden="true">
        <defs>
          <pattern id={`${id}-grid`} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" stroke="#e5e4ee" strokeWidth=".7" /></pattern>
          <linearGradient id={`${id}-plot`} x1="165" y1="125" x2="375" y2="330" gradientUnits="userSpaceOnUse"><stop stopColor="#ede7ff" /><stop offset="1" stopColor="#d9ccff" /></linearGradient>
          <linearGradient id={`${id}-roof`} x1="213" y1="153" x2="321" y2="211" gradientUnits="userSpaceOnUse"><stop stopColor="#9471de" /><stop offset="1" stopColor="#6441ac" /></linearGradient>
          <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="220%"><feDropShadow dx="0" dy="12" stdDeviation="13" floodColor="#453066" floodOpacity=".13" /></filter>
          <linearGradient id={`${id}-scan`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".48" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <clipPath id={`${id}-house-clip`}><path d="m161 165 38-68 70 40 36 28-7 4v47l-66 38-66-38v-49Z" /></clipPath>
        </defs>
        <path fill={`url(#${id}-grid)`} d="M0 0h520v470H0z" />
        <g stroke="#d9d8e4" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M-36 126 104 44l100 58-137 80Z" fill="#f6f5fa" />
          <path d="m114 38 131-76 99 58-130 76Z" fill="#f1f0f7" />
          <path d="m223 102 131-76 132 77-131 76Z" fill="#f9f8fc" />
          <path d="m367 185 137-79 132 77-136 79Z" fill="#f1f0f7" />
          <path d="m366 203 134 77-138 80-132-78Z" fill="#f6f5fa" />
          <path d="m217 291 132 77-131 76-132-77Z" fill="#f2f1f8" />
          <path d="m71 377 133 78-124 72-132-78Z" fill="#f6f5fa" />
          <path d="m-69 252 136-78 133 77-136 79Z" fill="#f7f7fa" />
          <path d="m-71 270 120 70-116 67-122-69Z" fill="#f0eff6" />
        </g>
        <g fill="#e7e6ef" stroke="#d5d3df" strokeLinejoin="round">
          <path d="m51 118 47-27 50 29-47 27Z" /><path d="m293 93 49-28 69 40-49 28Z" />
          <path d="m394 269 36-21 45 26-36 21Z" /><path d="m170 363 47-27 53 31-47 27Z" />
          <path d="m18 264 39-23 59 34-39 23Z" />
        </g>
        <g fill="#a5a1b4" fontSize="10" fontFamily="inherit" textAnchor="middle">
          <text x="160" y="64">128/2</text><text x="383" y="75">126/1</text><text x="425" y="318">130/4</text><text x="253" y="412">132/1</text><text x="43" y="310">134/2</text>
        </g>
        <path d="m81 174 132-77 143 83-134 78Z" fill={`url(#${id}-plot)`} stroke="#9672dc" strokeWidth="1.7" />
        <path d="m81 174 132-77 143 83-134 78Z" stroke="#fff" strokeOpacity=".75" strokeDasharray="3 5" strokeWidth="1.5" transform="translate(0 6)" />
        {animated && <path className={styles.parcelTrace} d="m81 174 132-77 143 83-134 78Z" pathLength="100" stroke="#8050c7" strokeWidth="3" strokeLinecap="round" />}
        <g fill="#fff" stroke="#9773df" strokeWidth="2">
          <circle cx="81" cy="174" r="3.5" /><circle cx="213" cy="97" r="3.5" /><circle cx="356" cy="180" r="3.5" /><circle cx="222" cy="258" r="3.5" />
        </g>
        <path d="m191 216 37-21 40 23-37 21Z" fill="#bda8e6" opacity=".4" />
        <g filter={`url(#${id}-shadow)`}>
          <CuzkHouse roofFill={`url(#${id}-roof)`} />
        </g>
        {animated && <g clipPath={`url(#${id}-house-clip)`}><rect className={styles.houseScan} x="82" y="80" width="78" height="180" fill={`url(#${id}-scan)`} /></g>}
        <g transform="translate(127 162)"><path d="M0 14v19" stroke="#a6a4b4" strokeWidth="3" /><ellipse cy="7" rx="11" ry="16" fill="#bfcec5" /><path d="M0-4v26" stroke="#96af9f" strokeWidth="1.2" /></g>
        <g transform="translate(321 183)"><path d="M0 14v17" stroke="#a6a4b4" strokeWidth="3" /><ellipse cy="5" rx="10" ry="15" fill="#cbd7cf" /></g>
        {animated && <ellipse className={styles.locationPulse} cx="241" cy="94" rx="20" ry="8" stroke="#a27ad4" strokeWidth="1.5" />}
        <g className={styles.pin}>
          <ellipse cx="241" cy="94" rx="20" ry="8" fill="#8053d1" fillOpacity=".1" />
          <path d="M241 88s-17-17-17-29a17 17 0 1 1 34 0c0 12-17 29-17 29Z" fill="#7645c6" stroke="#fff" strokeWidth="3" />
          <circle cx="241" cy="59" r="5" fill="#fff" />
        </g>
      </svg>
  );
}
