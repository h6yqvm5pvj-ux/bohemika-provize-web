/** Decorative document scenes; these shapes do not represent production data. */
export function ProductionIllustration({ tone }: { tone: "own" | "team" | "tip" | "total" }) {
  const dark = tone === "total";
  const ink = dark ? "#D7C3F0" : "#9372B1";
  const line = dark ? "#A28BBD" : "#D4C2E4";
  const paper = dark ? "#F0E7FA" : "#FFFFFF";
  const soft = dark ? "#695083" : "#EEE5F6";
  return (
    <svg viewBox="0 0 164 112" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="83" cy="99" rx="62" ry="7" fill={soft} opacity=".65" />
      <circle cx="84" cy="53" r="43" fill={soft} opacity=".6" />
      {tone === "team" ? <>
        <path d="M82 45v19M45 76V64h74v12" stroke={line} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="57" y="9" width="50" height="42" rx="12" fill={paper} stroke={line} />
        <circle cx="82" cy="25" r="6" fill="#D6C1E6" /><path d="M70 42c0-13 24-13 24 0" fill="#B094CC" />
        {[27,101].map(x=><g key={x}><rect x={x} y="72" width="38" height="28" rx="8" fill={paper} stroke={line} /><circle cx={x+12} cy="85" r="4" fill="#C5AFDA" /><path d={`M${x+21} 82h8m-8 6h5`} stroke={line} strokeWidth="2" strokeLinecap="round" /></g>)}
      </> : tone === "total" ? <>
        <g transform="rotate(-12 60 56)"><rect x="31" y="17" width="61" height="74" rx="9" fill="#B69BCC" /><path d="M43 33h23M43 43h33M43 53h27" stroke="#DCCCEC" strokeWidth="3" strokeLinecap="round" /></g>
        <g transform="rotate(8 93 59)"><rect x="66" y="19" width="63" height="77" rx="9" fill={paper} stroke="#DCCCEC" /><path d="M79 37h20M79 47h36M79 57h30" stroke="#C4AED7" strokeWidth="3" strokeLinecap="round" /></g>
        <rect x="99" y="65" width="35" height="35" rx="12" fill="#B6E4D1" /><path d="M122 74h-12l7 8-7 9h12" stroke="#42695B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </> : <>
        <g transform="rotate(-9 78 57)">
          <rect x="40" y="13" width="74" height="83" rx="11" fill="#E2D4ED" />
          <rect x="46" y="8" width="74" height="83" rx="11" fill={paper} stroke={line} />
          <rect x="59" y="22" width="26" height="5" rx="2.5" fill="#BCA0D2" />
          <path d="M59 39h45M59 50h36M59 61h42M59 72h23" stroke="#E1D5EB" strokeWidth="3.5" strokeLinecap="round" />
        </g>
        <circle cx="116" cy="78" r="20" fill={tone === "tip" ? "#EED8EB" : "#DCEEE7"} stroke={paper} strokeWidth="3" />
        {tone === "tip" ? <path d="m107 75 8-8h9v9l-8 8-9-9Z" stroke="#A56C99" strokeWidth="2" strokeLinejoin="round" /> : <><circle cx="116" cy="73" r="5" stroke="#7C9D91" strokeWidth="2" /><path d="M107 87c0-12 18-12 18 0" stroke="#7C9D91" strokeWidth="2" strokeLinecap="round" /></>}
      </>}
      <path d="M24 42v6m-3-3h6M139 24v6m-3-3h6" stroke={ink} strokeWidth="1.5" strokeLinecap="round" opacity=".65" />
      <circle cx="143" cy="62" r="2.5" fill={line} />
    </svg>
  );
}
