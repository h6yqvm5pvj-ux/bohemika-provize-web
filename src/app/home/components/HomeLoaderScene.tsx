import { useId } from "react";
import styles from "./homeLoaderScene.module.css";

type Props = { type: "production" | "payout" };
const bars = [28, 44, 36, 66, 53, 81];

function ProductionScene({ id }: { id: string }) {
  return <>
    <path d="M114 140c38 0 22-45 65-45M234 172c0 28 39 12 51 38" stroke="#dfd5ef" strokeWidth="1.5" />
    <path className={styles.signal} d="M114 140c38 0 22-45 65-45" pathLength="100" stroke="#b595e0" strokeWidth="2.5" strokeLinecap="round" />
    <g className={styles.document}>
      <g transform="rotate(-9 97 132)">
        <rect x="48" y="66" width="96" height="129" rx="13" fill="#eee7f9" stroke="#e2d6f0" />
      </g>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="47" y="58" width="96" height="131" rx="13" fill="#fff" stroke="#e6ddf2" />
        <path d="M66 85v-8h17l7 7v19H66V85Zm17-8v8h7" stroke="#9f7cc7" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="65" y="116" width="44" height="5" rx="2.5" fill="#d7c5ed" />
        <path d="M65 132h58M65 143h42" stroke="#ece6f3" strokeWidth="4" strokeLinecap="round" />
        <rect x="65" y="159" width="23" height="13" rx="4" fill="#f4effb" /><rect x="96" y="159" width="27" height="13" rx="4" fill="#f4effb" />
      </g>
    </g>
    <g className={styles.dashboard} filter={`url(#${id}-shadow)`}>
      <rect x="165" y="48" width="187" height="153" rx="17" fill="#fff" stroke="#e7e0f1" />
      <rect x="181" y="64" width="48" height="5" rx="2.5" fill="#d2bee9" />
      <circle cx="328" cy="66" r="3" fill="#e3d8f0" />
      <path d="M182 96h151M182 123h151M182 151h151M182 180h151" stroke="#f0ebf7" strokeWidth="1" />
      {bars.map((height, index) => <rect className={styles.bar} key={index} x={187 + index * 24} y={180 - height} width="13" height={height} rx="4" fill={index > 3 ? `url(#${id}-accent)` : "#e4d8f3"} style={{ animationDelay: `${index * -.35}s` }} />)}
      <path className={styles.trend} d="m190 122 24-16 24 5 24-27 24 9 24-18" pathLength="100" stroke="#aa86d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="310" cy="75" r="3.5" fill="#b49ad6" stroke="#fff" strokeWidth="2" />
    </g>
    <g className={styles.summary} filter={`url(#${id}-shadow)`}>
      <rect x="215" y="185" width="137" height="48" rx="12" fill="#fff" stroke="#e9e2f2" />
      <rect x="226" y="195" width="27" height="27" rx="8" fill="#edf6f2" />
      <path d="M233 208h13m-10-4 4-3 4 3m-8 8 4 3 4-3" stroke="#83ad9c" strokeWidth="1.5" strokeLinecap="round" />
      <text x="263" y="204" fill="#897699" fontSize="9">Provize</text>
      <rect className={styles.placeholder} x="263" y="214" width="65" height="4" rx="2" fill="#e8e0f1" />
    </g>
    <g className={styles.miniCard} filter={`url(#${id}-shadow)`}>
      <rect x="38" y="210" width="96" height="32" rx="10" fill="#fff" stroke="#e9e2f2" />
      <circle cx="53" cy="226" r="4" fill="#c6b0e1" /><text x="65" y="229" fill="#897699" fontSize="9">Smlouvy</text>
    </g>
  </>;
}

function PayoutScene({ id }: { id: string }) {
  return <>
    <path className={styles.signal} d="M105 99c0 62 98-17 124 43" pathLength="100" stroke="#c3aadf" strokeWidth="2" strokeLinecap="round" />
    <g className={styles.receipt}>
      <g transform="rotate(7 214 111)" filter={`url(#${id}-shadow)`}>
        <path d="M174 40h69a9 9 0 0 1 9 9v122l-9-6-9 6-9-6-9 6-9-6-9 6-9-6-9 6-15-7V49a9 9 0 0 1 9-9Z" fill="#fff" stroke="#e4dbf0" />
        <rect x="182" y="57" width="41" height="5" rx="2.5" fill="#d2bce9" />
        <path d="M182 77h52M182 89h44M182 101h52" stroke="#ebe4f3" strokeWidth="4" strokeLinecap="round" />
        <path d="M182 119h52" stroke="#dfd2ef" strokeDasharray="3 3" /><rect x="207" y="132" width="27" height="7" rx="3" fill="#d5c2ea" />
      </g>
    </g>
    <g className={styles.wallet} filter={`url(#${id}-shadow)`}>
      <path d="M132 126q0-12 12-14l117-14q13-1 13 13v18Z" fill="#cab3e5" stroke="#bfa3df" />
      <rect x="129" y="123" width="151" height="94" rx="17" fill={`url(#${id}-wallet)`} stroke="#9167bd" />
      <rect x="139" y="133" width="130" height="74" rx="11" stroke="#c4a6e0" strokeOpacity=".6" strokeDasharray="2 4" />
      <path d="M137 129h126" stroke="#d7c1ef" strokeOpacity=".7" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="242" y="152" width="47" height="33" rx="10" fill="#d7c2ed" stroke="#bb9dd9" />
      <circle cx="255" cy="168" r="4" fill="#fff" fillOpacity=".85" />
      <path d="M150 184h32M150 191h20" stroke="#dbcaed" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
    </g>
    <g className={styles.coins}>
      <path d="M80 201v15c0 15 49 15 49 0v-15" fill="#d5b67d" stroke="#c8a767" />
      <path d="M80 208c0 15 49 15 49 0" stroke="#f0dcb1" />
      <ellipse cx="104.5" cy="201" rx="24.5" ry="10" fill="#f4e6c8" stroke="#d6bb8a" />
      <ellipse cx="104.5" cy="201" rx="16" ry="6" stroke="#ddc397" />
      <path d="M108 225v9c0 10 37 10 37 0v-9" fill="#bad5c8" stroke="#9fbfae" /><ellipse cx="126.5" cy="225" rx="18.5" ry="8" fill="#e4f1e9" stroke="#b1ccbe" />
    </g>
    <g className={styles.miniCard} filter={`url(#${id}-shadow)`}>
      <rect x="33" y="69" width="112" height="43" rx="12" fill="#fff" stroke="#e9e2f2" />
      <path d="m52 81 8 3v7c0 7-8 11-8 11s-8-4-8-11v-7Z" fill="#f2edf8" stroke="#baa2d1" />
      <text x="71" y="88" fill="#897699" fontSize="9">Storno fond</text><rect className={styles.placeholder} x="71" y="96" width="43" height="4" rx="2" fill="#e8e0f1" />
    </g>
    <g className={styles.summary}>
      <circle cx="309" cy="126" r="20" fill="#fff" stroke="#e5dbf0" />
      <path d="M302 125h14m-7-7v14" stroke="#b89bd7" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  </>;
}

export function HomeLoaderScene({ type }: Props) {
  const id = useId();
  return <div className={styles.scene} data-visual={type} aria-hidden="true">
    <svg viewBox="0 0 400 280" fill="none">
      <defs>
        <radialGradient id={`${id}-glow`}><stop stopColor="#eadffc" stopOpacity=".65" /><stop offset="1" stopColor="#faf8ff" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-accent`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b396da" /><stop offset="1" stopColor="#ded0f0" /></linearGradient>
        <linearGradient id={`${id}-wallet`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#af8bd1" /><stop offset="1" stopColor="#79529e" /></linearGradient>
        <filter id={`${id}-shadow`} x="-25%" y="-25%" width="150%" height="175%"><feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#71538f" floodOpacity=".08" /></filter>
      </defs>
      <ellipse cx="200" cy="146" rx="180" ry="125" fill={`url(#${id}-glow)`} />
      <circle cx="200" cy="140" r="113" stroke="#e8e0f2" strokeDasharray="2 7" />
      <circle cx="200" cy="140" r="86" stroke="#efe9f6" />
      <circle className={styles.orbitDot} cx="98" cy="90" r="3" fill="#cdb9e6" />
      <circle className={styles.orbitDot} cx="295" cy="200" r="3" fill="#d2c2e8" />
      {type === "production" ? <ProductionScene id={id} /> : <PayoutScene id={id} />}
      <path d="M326 39v8m-4-4h8M65 168v6m-3-3h6" stroke="#c3aadf" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  </div>;
}
