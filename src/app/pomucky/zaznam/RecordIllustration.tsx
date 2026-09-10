import { useId } from "react";

/** A lightweight, decorative illustration shared by the form and its output. */
export function RecordIllustration({ complete = false }: { complete?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 320 230" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-paper`} x1="85" y1="30" x2="238" y2="212" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" /><stop offset="1" stopColor="#F2EBFA" />
        </linearGradient>
        <linearGradient id={`${id}-pen`} x1="220" y1="104" x2="251" y2="174" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A688D0" /><stop offset="1" stopColor="#62408C" />
        </linearGradient>
      </defs>
      <ellipse cx="169" cy="206" rx="113" ry="12" fill="#E5DDEE" opacity=".65" />
      <circle cx="161" cy="113" r="95" fill="#EEE5F7" />
      <circle cx="161" cy="113" r="77" stroke="#E2D5F0" strokeDasharray="3 7" />
      <g transform="rotate(-9 140 117)">
        <rect x="67" y="45" width="146" height="153" rx="16" fill="#DBCDEB" />
        <rect x="78" y="27" width="155" height="172" rx="16" fill={`url(#${id}-paper)`} stroke="#D7C8E7" />
        <rect x="124" y="19" width="62" height="19" rx="7" fill="#BDA5D7" />
        <path d="M147 19v-3a8 8 0 0 1 16 0v3" stroke="#BDA5D7" strokeWidth="5" />
        <rect x="99" y="58" width="58" height="6" rx="3" fill="#71538C" />
        <rect x="99" y="72" width="93" height="4" rx="2" fill="#DDD1E9" />
        {[96, 122, 148].map((y, index) => <g key={y}>
          <rect x="99" y={y} width="14" height="14" rx="4" fill={index < 2 || complete ? "#E7DCF3" : "white"} stroke="#CBB7DF" />
          {(index < 2 || complete) && <path d={`M103 ${y + 7}l3 3 4-6`} stroke="#8056AB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
          <rect x="123" y={y + 2} width={index === 1 ? 62 : 79} height="4" rx="2" fill="#CBBADA" />
          <rect x="123" y={y + 10} width={index === 2 ? 49 : 58} height="3" rx="1.5" fill="#E3D9ED" />
        </g>)}
        <path d="M162 181c7-13 4 7 14-3s7 5 19-5" stroke="#A689C2" strokeWidth="2" strokeLinecap="round" />
      </g>
      {complete ? <g>
        <rect x="219" y="131" width="60" height="60" rx="20" fill="#5B4375" />
        <path d="m235 160 9 9 19-21" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g> : <g transform="rotate(26 242 139)">
        <rect x="232" y="81" width="14" height="98" rx="6" fill={`url(#${id}-pen)`} />
        <path d="m232 173 7 20 7-20" fill="#D7C5E5" /><path d="m236 185 3 8 3-8" fill="#5A4075" />
        <path d="M244 91h5v29" stroke="#BAA1D4" strokeWidth="3" strokeLinecap="round" />
      </g>}
      <path d="M55 86v12m-6-6h12M265 54v10m-5-5h10" stroke="#B69ACD" strokeWidth="2" strokeLinecap="round" />
      <circle cx="49" cy="163" r="4" fill="#D3C0E3" /><circle cx="282" cy="112" r="3" fill="#D3C0E3" />
    </svg>
  );
}
