import { useId } from "react";

export function ComparisonIllustration() {
  const id = useId();
  return (
    <svg viewBox="0 0 350 240" fill="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="100" y1="35" x2="250" y2="205" gradientUnits="userSpaceOnUse"><stop stopColor="#a484bd" /><stop offset="1" stopColor="#674580" /></linearGradient></defs>
      <ellipse cx="177" cy="214" rx="136" ry="14" fill="#e9def2" />
      <circle cx="188" cy="113" r="98" fill="#eee5f7" />
      <circle cx="188" cy="113" r="79" stroke="#ddcbea" strokeDasharray="4 7" />
      <g transform="rotate(-9 75 125)"><rect x="25" y="68" width="115" height="135" rx="18" fill="white" stroke="#e2d4ec" strokeWidth="2" /><rect x="42" y="87" width="41" height="6" rx="3" fill="#cab3db" /><rect x="42" y="101" width="67" height="4" rx="2" fill="#e6dcee" /><rect x="44" y="159" width="18" height="26" rx="4" fill="#e0d1ec" /><rect x="69" y="141" width="18" height="44" rx="4" fill="#c5aed8" /><rect x="94" y="119" width="18" height="66" rx="4" fill="#a886bf" /></g>
      <path d="M190 38c20 16 43 21 62 22v61c0 41-31 66-62 82-31-16-62-41-62-82V60c19-1 42-6 62-22Z" fill={`url(#${id})`} stroke="#fff" strokeWidth="5" />
      <path d="m165 119 17 17 33-37" stroke="#e1f5eb" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="rotate(8 275 164)"><rect x="232" y="128" width="95" height="69" rx="17" fill="#fff" stroke="#decee9" strokeWidth="2" /><circle cx="252" cy="151" r="7" fill="#bce3d2" /><rect x="267" y="146" width="41" height="6" rx="3" fill="#b39ac5" /><rect x="248" y="171" width="57" height="5" rx="2.5" fill="#e4d8ed" /></g>
      <path d="M58 39v12m-6-6h12m241 39v10m-5-5h10" stroke="#bba0ce" strokeWidth="2" strokeLinecap="round" /><circle cx="290" cy="39" r="4" fill="#c5e3d5" />
    </svg>
  );
}
