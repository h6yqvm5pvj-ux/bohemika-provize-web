import type { ReactNode } from "react";
import type { ToolHubToolKey } from "./toolHub";
import styles from "./ToolIllustration.module.css";

const ink = "var(--scene-color)";
const mid = "var(--scene-mid)";
const pale = "var(--scene-light)";

function Panel({ children, x = 39, y = 36, width = 70, height = 79 }: {
  children?: ReactNode; x?: number; y?: number; width?: number; height?: number;
}) {
  return <g transform={`translate(${x} ${y}) skewY(-12)`}>
    <path d={`M${width} 0l7 5v${height - 4}l-7 4Z`} fill={mid} />
    <rect width={width} height={height} rx="5" fill="#fff" stroke={mid} strokeWidth="1.2" />
    {children}
  </g>;
}

function Coins({ x, y, height = 13, radius = 15 }: { x: number; y: number; height?: number; radius?: number }) {
  return <g>
    <path d={`M${x - radius} ${y}v${height}c0 10 ${radius * 2} 10 ${radius * 2} 0v-${height}`} fill={mid} stroke={ink} strokeWidth=".7" />
    <path d={`M${x - radius} ${y + height / 2}c0 10 ${radius * 2} 10 ${radius * 2} 0`} stroke={ink} strokeOpacity=".3" />
    <ellipse cx={x} cy={y} rx={radius} ry="7" fill={pale} stroke={ink} strokeWidth=".7" />
    <ellipse cx={x} cy={y} rx={radius - 5} ry="3.5" stroke={mid} />
  </g>;
}

function Person({ x, y, pale: muted = false }: { x: number; y: number; pale?: boolean }) {
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cy="4" rx="8" ry="9" fill={muted ? mid : ink} />
    <path d="M-15 35v-9c0-16 30-16 30 0v9c-8 4-22 4-30 0Z" fill={muted ? pale : mid} />
    <path d="m-5 17 5 7 5-7" stroke="#fff" strokeWidth="1.5" />
  </g>;
}

function Clock({ x, y, radius = 23 }: { x: number; y: number; radius?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle cx="3" cy="3" r={radius} fill={mid} />
    <circle r={radius} fill="#fff" stroke={ink} strokeWidth="2" />
    <path d={`M0 ${-radius + 7}V0l${radius * .48} ${radius * .25}`} stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
    <circle r="2.5" fill={ink} />
  </g>;
}

function Shield({ x, y, children }: { x: number; y: number; children?: ReactNode }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="m0-29 25 9v23c0 17-25 31-25 31S-25 20-25 3v-23Z" fill={mid} />
    <path d="m-4-31 25 9V1c0 17-25 31-25 31S-29 18-29 1v-23Z" fill="#fff" stroke={ink} strokeWidth="1.5" />
    {children}
  </g>;
}

function Check({ x = 0, y = 0 }: { x?: number; y?: number }) {
  return <path d={`m${x - 10} ${y} 7 7 15-17`} stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
}

function SmallHouse() {
  return <g>
    <path d="m34 66 26-18 30 17v40l-26 16-30-17Z" fill="#fff" stroke={mid} />
    <path d="m64 82 26-17v40l-26 16Z" fill={pale} />
    <path d="m28 66 30-36 34 20 7 19-35-20-28 24Z" fill={ink} />
    <path d="m58 30 34 20 7 19-35-20Z" fill={mid} />
    <path d="m43 82 10 6v12l-10-6Z" fill={mid} stroke="#fff" strokeWidth="1.5" />
    <path d="m72 91 9-5v19l-9 5Z" fill={ink} />
  </g>;
}

function Report({ chart = false }: { chart?: boolean }) {
  return <Panel>
    <rect x="10" y="12" width="29" height="4" rx="2" fill={ink} />
    <rect x="10" y="23" width="46" height="3" rx="1.5" fill={pale} />
    {chart ? <>
      <path d="M12 65h43" stroke={mid} />
      <rect x="15" y="47" width="8" height="17" rx="1" fill={pale} />
      <rect x="29" y="39" width="8" height="25" rx="1" fill={mid} />
      <rect x="43" y="32" width="8" height="32" rx="1" fill={ink} />
    </> : <path d="M11 39h43M11 50h35M11 61h24" stroke={mid} strokeWidth="3" strokeLinecap="round" />}
  </Panel>;
}

export function ToolSceneDrawing({ toolKey }: { toolKey: ToolHubToolKey }) {
  switch (toolKey) {
    case "srovnani-nabidek":
      return <>
        <Panel x={21} y={40} width={48} height={72}>
          <rect x="9" y="11" width="30" height="7" rx="2" fill={mid} />
          <path d="M10 30h26M10 42h18M10 54h23" stroke={pale} strokeWidth="4" strokeLinecap="round" />
        </Panel>
        <Panel x={88} y={26} width={48} height={72}>
          <rect x="9" y="11" width="30" height="7" rx="2" fill={ink} />
          <path d="M10 30h26M10 42h18M10 54h23" stroke={mid} strokeWidth="4" strokeLinecap="round" />
        </Panel>
        <g className={styles.detail}><circle cx="80" cy="112" r="15" fill={ink} /><path d="M72 108h16m-16 8h16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" /></g>
      </>;
    case "argumenty":
      return <>
        <Person x={43} y={82} /><Person x={112} y={69} pale />
        <g className={styles.detail}>
          <path d="M20 28q0-5 5-5h49q5 0 5 5v27q0 5-5 5H43L31 72V60h-6q-5 0-5-5Z" fill="#fff" stroke={mid} strokeWidth="1.5" />
          <path d="M39 35h-6v9h6m18-9h-6v9h6" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        </g>
        <path d="M88 37h39q5 0 5 5v19q0 5-5 5h-6v11l-12-11H88q-5 0-5-5V42q0-5 5-5Z" fill={pale} />
        <path d="M94 49h26M94 57h15" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      </>;
    case "dokumenty":
      return <>
        <g transform="translate(26 48) skewY(-12)">
          <path d="M0 3q0-5 5-5h25l8 10h47v71H0Z" fill={ink} />
          <path d="M10 9h54l13 13v47H10Z" fill="#fff" stroke={mid} /><path d="M64 9v13h13" fill={pale} />
          <path d="M20 32h41M20 42h30" stroke={mid} strokeWidth="3" strokeLinecap="round" />
          <g className={styles.detail}><path d="M-4 36h81q6 0 7 6l7 32q1 5-5 5H6Z" fill={pale} stroke={mid} /><rect x="33" y="49" width="25" height="10" rx="3" fill="#fff" /></g>
        </g>
      </>;
    case "vypoved-smlouvy":
      return <>
        <g transform="translate(6 -7)"><Report /></g>
        <path d="m20 84 65-16 43 21v33l-69 15-39-20Z" fill={pale} stroke={mid} />
        <path d="m20 84 52 17 56-12-45 29Z" fill="#fff" stroke={mid} />
        <g className={styles.detail}><circle cx="116" cy="53" r="17" fill={ink} /><path d="m110 47 12 12m0-12-12 12" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></g>
      </>;
    case "jak-stiham-vypoved-smlouvy":
      return <>
        <Panel x={30} y={36} width={69} height={75}>
          <path d="M0 18h69" stroke={ink} strokeWidth="14" /><path d="M15-3v17M53-3v17" stroke={mid} strokeWidth="4" strokeLinecap="round" />
          <path d="M14 37h7m12 0h7m12 0h5M14 52h7m12 0h7" stroke={mid} strokeWidth="6" />
          <circle cx="52" cy="51" r="10" stroke={ink} strokeWidth="2" />
        </Panel>
        <g className={styles.detail}><Clock x={114} y={100} /></g>
      </>;
    case "nahrada-smlouvy":
      return <>
        <Panel x={24} y={39} width={43} height={57}><path d="M9 13h24M9 25h18M9 37h23" stroke={mid} strokeWidth="3" strokeLinecap="round" /></Panel>
        <Panel x={95} y={31} width={43} height={57}><Check x={20} y={27} /></Panel>
        <path d="M65 32q20-15 34-8m-6-5 7 6-8 2M98 104q-27 18-42 2m0 7-1-8 8 1" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <g className={styles.detail}><Coins x={79} y={79} radius={17} height={17} /></g>
      </>;
    case "online-vizitka":
    case "kontakty":
      return <>
        <Panel x={42} y={24} width={60} height={103}>
          <rect x="19" y="5" width="22" height="3" rx="1.5" fill={mid} />
          <Person x={30} y={25} />
          <path d="M15 70h30M21 78h18" stroke={mid} strokeWidth="3" strokeLinecap="round" />
          <rect x="20" y="87" width="21" height="7" rx="3.5" fill={ink} />
        </Panel>
        <g className={styles.detail} transform="translate(104 85) skewY(-12)"><rect width="32" height="34" rx="4" fill="#fff" stroke={mid} /><path d="M6 6h8v8H6Zm14 0h6v8h-6ZM6 21h8v7H6Zm14-2h4v4h-4Zm4 6h3v4h-3Z" fill={ink} /></g>
      </>;
    case "hypoteka-vlastni-zdroje":
      return <>
        <SmallHouse /><Coins x={117} y={93} height={25} /><Coins x={96} y={112} height={10} radius={12} />
        <g className={styles.detail} transform="translate(100 34)"><circle r="14" fill="#fff" stroke={mid} /><path d="m-5 6 10-12" stroke={ink} strokeWidth="2" /><circle cx="-5" cy="-4" r="2" fill={ink} /><circle cx="5" cy="4" r="2" fill={ink} /></g>
      </>;
    case "statistika":
      return <>
        <Panel x={24} y={40} width={111} height={69}>
          <path d="M0 13h111" stroke={pale} /><circle cx="8" cy="7" r="2" fill={mid} /><circle cx="15" cy="7" r="2" fill={mid} />
          <g className={styles.detail}><circle cx="31" cy="39" r="16" stroke={pale} strokeWidth="8" /><path d="M31 23a16 16 0 0 1 16 16H31Z" fill={ink} /></g>
          <path d="M61 55h38" stroke={mid} /><rect x="65" y="39" width="7" height="15" rx="1" fill={pale} /><rect x="77" y="29" width="7" height="25" rx="1" fill={mid} /><rect x="89" y="22" width="7" height="32" rx="1" fill={ink} />
        </Panel>
        <path d="M79 107v15m-18 5 36-8" stroke={mid} strokeWidth="5" strokeLinecap="round" />
      </>;
    case "export-produkce":
      return <>
        <Report chart />
        <g className={styles.detail}><circle cx="119" cy="105" r="22" fill={ink} /><path d="M119 92v21m-8-8 8 8 8-8M107 119h24" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></g>
      </>;
    case "plan-produkce":
      return <>
        <path d="m71 89-19 35m33-34 21 26" stroke={mid} strokeWidth="5" strokeLinecap="round" />
        <g transform="translate(78 64) skewY(-12)"><circle cx="5" cy="3" r="41" fill={mid} /><circle r="41" fill="#fff" stroke={mid} /><circle r="29" fill={pale} /><circle r="18" fill="#fff" /><circle r="7" fill={ink} /></g>
        <g className={styles.detail}><path d="m78 64 48-39m-15 8 1-13 14-10 1 13 13 2-14 10Z" fill={ink} stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></g>
      </>;
    case "tipar":
      return <>
        <Person x={41} y={58} /><Person x={118} y={45} pale />
        <path d="M47 42q36-30 65-8m-4-10 6 12-13-1" stroke={mid} strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
        <path d="m46 95 17 7 26-5 21-14" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        <g className={styles.detail}><Coins x={78} y={79} height={14} /></g>
      </>;
    case "zlato":
      return <>
        <g fill="#d9b75d" stroke="#bc9845" strokeWidth="1" strokeLinejoin="round">
          <path d="m21 88 40-22 35 16 8 19-46 25-42-19Z" /><path d="m21 88 37 18 38-24-35-16Z" fill="#f6df93" /><path d="m58 106 46-25v20l-46 25Z" fill="#caa24c" />
          <path d="m72 83 38-21 30 14 6 18-40 23-39-18Z" /><path d="m72 83 34 15 34-22-30-14Z" fill="#f5d989" />
          <path d="m51 55 37-20 32 15 7 19-42 24-40-18Z" /><path d="m51 55 34 17 35-22-32-15Z" fill="#f8e5a6" /><path d="m85 72 42-23v20L85 93Z" fill="#c7a04c" />
        </g>
        <g className={styles.detail} stroke="#ba9542" strokeWidth="1.5" strokeLinecap="round"><path d="M32 39v12m-6-6h12m94-25v10m-5-5h10" /></g>
      </>;
    case "proklepka-vozidla":
      return <>
        <path d="m18 107 108-24 22 12-108 26Z" fill="#e4eaf3" /><path d="m23 112 115-25" stroke="#fff" strokeDasharray="7 5" />
        <g transform="translate(22 60) skewY(-12)">
          <path d="m4 21 14-24q3-5 10-5h35q8 0 12 7l11 18 19 8v21H0V28q0-5 4-7Z" fill={ink} />
          <path d="m21 17 9-18h30q7 0 10 5l8 13Z" fill="#edf5ff" /><path d="M50 0v17" stroke={mid} strokeWidth="3" />
          <path d="M1 28h98" stroke={mid} strokeWidth="4" /><rect x="3" y="33" width="9" height="5" rx="2" fill="#fff3cf" />
          <circle cx="22" cy="46" r="11" fill="#485567" /><circle cx="22" cy="46" r="5" fill="#d5e2ed" /><circle cx="80" cy="46" r="11" fill="#485567" /><circle cx="80" cy="46" r="5" fill="#d5e2ed" />
        </g>
        <g className={styles.detail}><circle cx="112" cy="38" r="19" fill="#fff" stroke={mid} strokeWidth="4" /><Check x={112} y={38} /><path d="m125 52 13 13" stroke={ink} strokeWidth="6" strokeLinecap="round" /></g>
      </>;
    case "nahrat-tachometr":
      return <>
        <g transform="translate(27 39) skewY(-12)">
          <rect x="5" y="5" width="103" height="70" rx="13" fill={mid} />
          <rect width="103" height="70" rx="13" fill="#fff" stroke={mid} strokeWidth="1.5" />
          <path d="M15 45a36 36 0 0 1 72 0" stroke={pale} strokeWidth="8" />
          <path d="M64 13a36 36 0 0 1 23 32" stroke={ink} strokeWidth="8" />
          <path d="m20 30 6 3m6-16 4 6m15-13v7m19 0-4 6m16 7-6 3" stroke={mid} strokeWidth="2" />
          <g className={styles.needle}><path d="m51 46 17-20" stroke={ink} strokeWidth="3" strokeLinecap="round" /><circle cx="51" cy="46" r="4" fill={ink} /></g>
          <rect x="34" y="55" width="34" height="8" rx="2" fill={pale} />
        </g>
        <g className={styles.detail}><circle cx="120" cy="113" r="18" fill={ink} /><path d="M120 123v-20m-7 7 7-7 7 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></g>
      </>;
    case "ares":
    case "odkazy-instituce":
      return <>
        <Panel x={34} y={31} width={87} height={87}>
          <rect x="8" y="9" width="71" height="12" rx="4" fill={pale} />
          <path d="M16 15h29" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          <path d="M12 67V33h27v34m-32 0h37" fill={pale} stroke={mid} />
          <path d="M18 40h4m8 0h4M18 49h4m8 0h4M18 58h4m8 0h4" stroke={ink} strokeWidth="3" />
          <path d="M51 37h25M51 49h18M51 61h23" stroke={mid} strokeWidth="3" strokeLinecap="round" />
        </Panel>
        <g className={styles.detail}><circle cx="116" cy="103" r="19" fill="#fff" stroke={mid} strokeWidth="4" /><path d="m128 117 13 13" stroke={ink} strokeWidth="6" strokeLinecap="round" /><path d="M109 103h14" stroke={ink} strokeWidth="2" /></g>
      </>;
    case "projekce-vykonu":
      return <>
        <Panel x={24} y={40} width={108} height={71}>
          <path d="M15 13v44h78M15 41h78M15 25h78" stroke={pale} />
          <path d="m16 52 21-10 17 3 18-16 18-13v41H16Z" fill={pale} />
          <path d="m16 52 21-10 17 3" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m54 45 18-16 18-13" stroke={ink} strokeWidth="3" strokeDasharray="4 4" strokeLinecap="round" />
          <g className={styles.detail}><circle cx="90" cy="16" r="5" fill={ink} stroke="#fff" strokeWidth="2" /></g>
        </Panel>
        <Coins x={117} y={111} height={12} radius={12} />
      </>;
    case "cestovni-pojisteni-cpp-vs-kooperativa":
      return <>
        <g transform="translate(39 62) skewY(-12)">
          <path d="M17-3v-13q0-4 4-4h21q4 0 4 4v13" stroke={ink} strokeWidth="4" />
          <rect x="7" y="3" width="64" height="60" rx="8" fill={ink} />
          <rect width="64" height="60" rx="8" fill={mid} stroke={ink} />
          <path d="M15 10v39m17-39v39m17-39v39" stroke="#fff" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round" />
          <circle cx="12" cy="65" r="4" fill={ink} /><circle cx="56" cy="65" r="4" fill={ink} />
        </g>
        <path d="M29 45q32-43 82-22" stroke={mid} strokeDasharray="3 4" strokeWidth="1.5" />
        <g className={styles.detail}><path d="m90 37 20-11 12-18 7 3-7 19 16 8-3 5-20-5-13 8-1 11-5 1-4-12-10-4Z" fill="#fff" stroke={ink} strokeWidth="1.5" strokeLinejoin="round" /></g>
      </>;
    case "nastaveni-zivotniho-pojisteni":
      return <>
        <path d="M80 31v65q0 13 12 13t12-12" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        <path d="M24 57a57 40 0 0 1 112 0q-13-13-27 0-15-13-29 0-15-13-29 0-14-13-27 0Z" fill={pale} stroke={mid} />
        <path d="M80 17q-19 11-29 40 14-13 29 0 14-13 29 0-10-29-29-40Z" fill={ink} /><path d="M80 10v7" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        <g className={styles.detail}><path d="M58 89c-16-17-33 3-20 18l20 18 20-18c13-15-4-35-20-18Z" fill={ink} /><path d="M39 105h10l4-7 7 14 5-7h12" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></g>
      </>;
    case "invalidni-duchod":
      return <>
        <Panel x={27} y={35} width={59} height={82}>
          <rect x="9" y="11" width="41" height="18" rx="3" fill={pale} />
          <path d="M15 21h12m8 0h9" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          {[0, 1, 2].map(row => [0, 1, 2].map(col => <rect key={`${row}-${col}`} x={10 + col * 15} y={39 + row * 12} width="9" height="7" rx="2" fill={col === 2 ? ink : mid} />))}
        </Panel>
        <Coins x={114} y={92} height={23} /><Coins x={95} y={114} height={10} radius={12} />
        <g className={styles.detail}><Shield x={116} y={52}><Check x={-4} /></Shield></g>
      </>;
    case "srovnavac-trvalych-nasledku":
      return <>
        <Panel x={76} y={31} width={58} height={83}>
          <path d="M10 65h39" stroke={mid} /><rect x="12" y="51" width="8" height="13" rx="1" fill={pale} /><rect x="25" y="35" width="8" height="29" rx="1" fill={mid} /><rect x="38" y="15" width="8" height="49" rx="1" fill={ink} />
        </Panel>
        <g className={styles.detail} transform="translate(16 22)">
          <circle cx="29" cy="16" r="11" fill={mid} />
          <path d="M11 43q18-15 36 0l7 25-12 4-6-18v29H18V54L11 78 0 74Z" fill={ink} />
          <path d="M19 83v24m16-24v24" stroke={mid} strokeWidth="10" strokeLinecap="round" />
          <path d="m19 49 21 15-24 4Z" fill="#fff" stroke={mid} strokeWidth="1.5" /><path d="m20 53-3 12m8-9-3 10" stroke={pale} strokeWidth="2" />
        </g>
      </>;
    case "srovnavac-pracovni-neschopnosti":
      return <>
        <g transform="translate(25 72) skewY(-12)">
          <path d="M0-23v67m101-33v33" stroke={ink} strokeWidth="5" strokeLinecap="round" />
          <path d="M1 16h99v14H1Z" fill={mid} />
          <path d="M4-4h29v22H4Z" fill="#fff" stroke={mid} /><path d="M35-5h53q12 0 12 12v10H35Z" fill={pale} stroke={mid} />
          <path d="M40 0v17m7-18v18" stroke="#fff" strokeWidth="2" />
        </g>
        <g className={styles.detail}><Clock x={112} y={43} radius={22} /></g>
        <path d="M39 39h20m-10-10v20" stroke={mid} strokeWidth="5" strokeLinecap="round" />
      </>;
    case "srovnavac-odpovednosti-obcana":
      return <>
        <path d="M26 43h34l-5 17q-1 6 7 15 16 23-1 44H24Q6 98 23 75q8-9 8-15Z" fill="#fff" stroke={mid} strokeWidth="1.5" />
        <ellipse cx="43" cy="43" rx="17" ry="4" fill={pale} stroke={mid} />
        <path d="m48 62-10 16 11 10-11 18 7 13" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        <path d="m17 121-7 4 13 5Z" fill={mid} />
        <g className={styles.detail}><Shield x={111} y={69}><Check x={-4} /></Shield></g>
        <circle cx="88" cy="116" r="14" fill={pale} stroke={mid} /><path d="m82 104 8 12-2 13m2-13 11-3" stroke={ink} strokeWidth="1.5" />
      </>;
    case "neon-life-vs-metlife-oneguard":
      return <>
        <Shield x={47} y={66}><path d="M-4-4c-10-11-22 3-13 13l13 12L9 9C18-1 6-15-4-4Z" fill={mid} /></Shield>
        <g className={styles.detail}><Shield x={118} y={51}><Check x={-4} /></Shield></g>
        <path d="M56 118h46m-6-5 6 5-6 5m-34-10-6 5 6 5" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>;
    case "zaznam":
    case "katastr":
    case "radar-vyroci":
    case "tvorba":
      return null;
  }
}
