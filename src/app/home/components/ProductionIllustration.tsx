import { useId } from "react";

/** Small sculpted symbols. Decorative only; their shapes do not encode amounts. */
export function ProductionIllustration({ tone }: { tone: "own" | "team" | "tip" | "total" }) {
  const id = useId().replace(/:/g, "");
  const fill = (name: string) => `url(#${id}-${name})`;
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-pearl`} x1="24" y1="12" x2="72" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" /><stop offset=".48" stopColor="#F4EFFA" /><stop offset="1" stopColor="#C7B7DB" />
        </linearGradient>
        <linearGradient id={`${id}-violet`} x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C1ABD9" /><stop offset=".5" stopColor="#A087BC" /><stop offset="1" stopColor="#75588F" />
        </linearGradient>
        <linearGradient id={`${id}-mint`} x1="43" y1="42" x2="80" y2="83" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E4FFF2" /><stop offset=".5" stopColor="#BAE7D2" /><stop offset="1" stopColor="#7AAF9A" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="30" y1="18" x2="70" y2="75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor="#fff" stopOpacity=".12" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-40%" y="-30%" width="180%" height="190%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="5" stdDeviation="3.5" floodColor="#38234D" floodOpacity={tone === "total" ? ".22" : ".13"} />
        </filter>
      </defs>
      {tone === "own" ? (
        <g filter={fill("shadow")}>
          <g transform="rotate(-12 44 45)">
            <rect x="24" y="18" width="43" height="57" rx="9" fill={fill("violet")} />
            <rect x="24" y="14" width="43" height="57" rx="9" fill={fill("pearl")} stroke={fill("edge")} />
            <rect x="28" y="18" width="35" height="49" rx="6" stroke="#fff" strokeOpacity=".55" />
            <path d="M34 30h13M34 41h22M34 48h22M34 55h14" stroke="#AB94C3" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="66" cy="66" r="16" fill="#7EA992" />
          <circle cx="66" cy="63" r="16" fill={fill("mint")} stroke={fill("edge")} />
          <circle cx="66" cy="59" r="4" stroke="#568570" strokeWidth="1.8" />
          <path d="M59 72v-2a7 7 0 0 1 14 0v2" stroke="#568570" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ) : tone === "team" ? (
        <g filter={fill("shadow")}>
          <path d="M34 60 48 39 68 61" stroke="#BDAACF" strokeWidth="3" strokeLinejoin="round" />
          <g transform="rotate(-9 31 57)">
            <rect x="13" y="43" width="32" height="32" rx="10" fill="#9C84B8" />
            <rect x="13" y="40" width="32" height="32" rx="10" fill={fill("pearl")} stroke={fill("edge")} />
            <circle cx="29" cy="51" r="4" fill={fill("violet")} />
            <path d="M22 65a7 7 0 0 1 14 0" fill={fill("violet")} />
          </g>
          <g transform="rotate(9 67 57)">
            <rect x="51" y="43" width="32" height="32" rx="10" fill="#9C84B8" />
            <rect x="51" y="40" width="32" height="32" rx="10" fill={fill("pearl")} stroke={fill("edge")} />
            <circle cx="67" cy="51" r="4" fill={fill("violet")} />
            <path d="M60 65a7 7 0 0 1 14 0" fill={fill("violet")} />
          </g>
          <rect x="31" y="19" width="34" height="34" rx="11" fill="#9173AB" />
          <rect x="31" y="15" width="34" height="34" rx="11" fill={fill("violet")} stroke={fill("edge")} />
          <circle cx="48" cy="27" r="4.5" fill="#F9F5FF" />
          <path d="M40 42a8 8 0 0 1 16 0" fill="#F9F5FF" />
        </g>
      ) : tone === "total" ? (
        <g filter={fill("shadow")}>
          <path d="m16 69 43-12 24 12-43 13-24-13Z" fill="#261B34" fillOpacity=".3" />
          <path d="m21 48 8 5v28l-8-5Z" fill="#BBA7D1" />
          <path d="m29 53 14-4v28l-14 4Z" fill={fill("pearl")} />
          <path d="m21 48 14-4 8 5-14 4Z" fill="#FBF7FF" />
          <path d="m40 34 8 5v37l-8-5Z" fill="#87669F" />
          <path d="m48 39 14-4v37l-14 4Z" fill={fill("violet")} />
          <path d="m40 34 14-4 8 5-14 4Z" fill="#D6C3EB" />
          <path d="m59 19 8 5v47l-8-5Z" fill="#83B49E" />
          <path d="m67 24 14-4v47l-14 4Z" fill={fill("mint")} />
          <path d="m59 19 14-4 8 5-14 4Z" fill="#EAFFF4" />
          <path d="M29 53v28m19-42v37m19-52v47" stroke="#fff" strokeOpacity=".5" />
        </g>
      ) : (
        <g filter={fill("shadow")} transform="rotate(-18 48 46)">
          <path d="M26 25a8 8 0 0 1 8-8h26l17 20a7 7 0 0 1 0 10L53 74a8 8 0 0 1-11 0L26 58Z" fill="#9B80B6" transform="translate(0 4)" />
          <path d="M26 25a8 8 0 0 1 8-8h26l17 20a7 7 0 0 1 0 10L53 74a8 8 0 0 1-11 0L26 58Z" fill={fill("pearl")} stroke={fill("edge")} />
          <circle cx="41" cy="32" r="4" fill="#9477AE" stroke="#fff" />
          <path d="m43 56 5 5 13-15" stroke="#9373AF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}
