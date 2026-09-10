import { useId } from "react";

export function VehicleReportIllustration({ kind, className }: { kind: "value" | "documents" | "journey"; className?: string }) {
  const id = useId().replace(/:/g, "");
  return <svg viewBox="0 0 200 150" fill="none" className={className} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-paper`} x1="60" y1="30" x2="150" y2="140" gradientUnits="userSpaceOnUse"><stop stopColor="white" /><stop offset="1" stopColor="#eee7fa" /></linearGradient>
      <linearGradient id={`${id}-purple`} x1="70" y1="45" x2="140" y2="130" gradientUnits="userSpaceOnUse"><stop stopColor="#b59ae9" /><stop offset="1" stopColor="#7953b6" /></linearGradient>
    </defs>
    <ellipse cx="105" cy="128" rx="69" ry="9" fill="#e9e1f4" opacity=".65" />
    {kind === "value" ? <>
      <path d="m61 105 12-67q1-7 8-6l73 12q7 1 6 8l-12 66Z" fill="#eee7fa" stroke="#d9cbea" />
      <rect x="44" y="32" width="98" height="84" rx="10" fill={`url(#${id}-paper)`} stroke="#d6c9e9" />
      <path d="M58 48h29m-29 8h17" stroke="#c8b8de" strokeWidth="3" strokeLinecap="round" />
      <path d="M59 92 78 77 93 81 124 61" stroke="#9671c9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m114 61 11-1-2 11" stroke="#9671c9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M59 101h67" stroke="#e7ddf2" strokeWidth="2" />
      {[0, 1, 2].map(i => <g key={i} transform={`translate(0 ${-i * 9})`}><path d="M111 110v10c0 7 43 7 43 0v-10" fill="#ae94d3" stroke="#9576bd" /><ellipse cx="132.5" cy="110" rx="21.5" ry="7" fill="#e6d9f7" stroke="#ac90d0" /></g>)}
      <path d="m128 92 4-2 6 2-6 2Z" fill="#b499d5" />
      <circle cx="162" cy="31" r="4" fill="#ded0ee" /><path d="M35 69h8m-4-4v8m116 20h8m-4-4v8" stroke="#beabd9" strokeWidth="2" strokeLinecap="round" />
    </> : kind === "documents" ? <>
      <rect x="59" y="27" width="92" height="100" rx="10" transform="rotate(9 59 27)" fill="#e6def2" stroke="#d1c1e6" />
      <rect x="42" y="22" width="91" height="101" rx="10" fill={`url(#${id}-paper)`} stroke="#d1c1e6" />
      <rect x="55" y="36" width="32" height="7" rx="3.5" fill="#baa2db" />
      <path d="M56 57h58M56 67h58M56 77h37" stroke="#d8c9e9" strokeWidth="3" strokeLinecap="round" />
      <rect x="54" y="90" width="40" height="19" rx="4" fill="#ede5f6" />
      {[0, 5, 9, 16, 20, 26].map(x => <path key={x} d={`M${61 + x} 95v9`} stroke="#bba4d7" strokeWidth={x % 2 ? 1 : 2} />)}
      <circle cx="137" cy="100" r="24" fill={`url(#${id}-purple)`} stroke="#f8f5fd" strokeWidth="5" />
      <path d="M127 100h20m-10-10v20" stroke="white" strokeWidth="2" strokeLinecap="round" /><circle cx="137" cy="100" r="7" stroke="white" strokeWidth="2" />
      <path d="M30 43h8m-4-4v8m122 19h8m-4-4v8" stroke="#beabd9" strokeWidth="2" strokeLinecap="round" />
    </> : <>
      <path d="M43 121V95c0-29 104-7 104-38V25" stroke="#e8e1f1" strokeWidth="28" strokeLinecap="round" />
      <path d="M43 121V95c0-29 104-7 104-38V25" stroke="#bba4d6" strokeWidth="2" strokeDasharray="4 7" strokeLinecap="round" />
      <circle cx="43" cy="112" r="9" fill="white" stroke="#bea8db" strokeWidth="3" />
      <path d="M146 12c-17 0-24 18-14 30l14 16 14-16c10-12 3-30-14-30Z" fill={`url(#${id}-purple)`} stroke="#8964ba" />
      <circle cx="146" cy="30" r="7" fill="#f4eefc" />
      <g transform="rotate(-17 94 80)"><rect x="79" y="57" width="30" height="47" rx="11" fill={`url(#${id}-paper)`} stroke="#a58abf" strokeWidth="1.5" /><path d="m84 67 20 0-3 10H87Z" fill="#a38bbb" /><path d="M86 91h16l1 5H85Z" fill="#c0afd3" /><path d="M81 81v8m26-8v8" stroke="#c0afd3" strokeWidth="2" /></g>
      <circle cx="49" cy="40" r="4" fill="#ded0ee" /><path d="M163 103h8m-4-4v8" stroke="#beabd9" strokeWidth="2" strokeLinecap="round" />
    </>}
  </svg>;
}
