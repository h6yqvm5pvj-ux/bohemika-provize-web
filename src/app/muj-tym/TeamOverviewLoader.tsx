"use client";

import { useId, type CSSProperties } from "react";
import { Activity, ChartNoAxesCombined, Network, UserRound, UsersRound } from "lucide-react";

import styles from "./TeamOverviewLoader.module.css";

type TeamOverviewLoaderProps = { progress: number };

const STAGES = [
  "Načítáme členy tvého týmu",
  "Načítáme aktivitu a produkci",
  "Připravujeme týmový přehled",
];

const MEMBERS = [
  { x: 156, y: 77, tone: "violet", path: "M156 77 C228 77 208 165 300 165" },
  { x: 302, y: 40, tone: "blue", path: "M302 40 C302 88 300 110 300 165" },
  { x: 446, y: 106, tone: "violet", path: "M446 106 C375 106 387 165 300 165" },
  { x: 434, y: 255, tone: "blue", path: "M434 255 C360 255 391 165 300 165" },
  { x: 279, y: 289, tone: "violet", path: "M279 289 C279 232 300 223 300 165" },
  { x: 147, y: 221, tone: "rose", path: "M147 221 C222 221 208 165 300 165" },
];

const FEATURES = [
  { label: "Členové týmu", icon: UsersRound },
  { label: "Aktivita", icon: Activity },
  { label: "Produkce", icon: ChartNoAxesCombined },
];

export function TeamOverviewLoader({ progress }: TeamOverviewLoaderProps) {
  const titleId = useId();
  const gradientId = useId();
  const phase = Math.min(2, Math.floor(Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0)) / 34));

  return (
    <section className={styles.scene} aria-labelledby={titleId}>
      <header className={styles.header} aria-hidden="true">
        <span className={styles.sectionLabel}><UsersRound size={15} strokeWidth={1.8} /> Můj tým</span>
        <span className={styles.liveLabel}><span /> Načítáme</span>
      </header>

      <div className={styles.content}>
        <div className={styles.network} aria-hidden="true">
          <div className={styles.ambient} />
          <svg className={styles.connections} viewBox="0 0 600 340" fill="none">
            <defs>
              <linearGradient id={gradientId} x1="140" y1="50" x2="460" y2="280" gradientUnits="userSpaceOnUse">
                <stop stopColor="#c4b5fd" /><stop offset=".52" stopColor="#8b5cf6" /><stop offset="1" stopColor="#c7d2fe" />
              </linearGradient>
            </defs>
            <circle className={styles.outerOrbit} cx="300" cy="165" r="151" />
            <circle className={styles.innerOrbit} cx="300" cy="165" r="100" />
            {MEMBERS.map((member, index) => (
              <g key={member.path}>
                <path className={styles.connection} d={member.path} />
                <path className={styles.signal} d={member.path} pathLength="100" stroke={`url(#${gradientId})`} style={{ animationDelay: `${index * -0.6}s` }} />
              </g>
            ))}
            <circle className={styles.orbitDot} cx="198" cy="53" r="3" />
            <circle className={styles.orbitDot} cx="395" cy="283" r="3" />
            <circle className={styles.smallDot} cx="486" cy="182" r="2" />
            <circle className={styles.smallDot} cx="221" cy="302" r="2" />
          </svg>

          {MEMBERS.map((member, index) => (
            <div key={member.path} className={styles.memberPosition} style={{ left: `${member.x / 6}%`, top: `${member.y / 3.4}%`, "--member-delay": `${index * -0.7}s` } as CSSProperties}>
              <div className={styles.member} data-tone={member.tone}>
                <UserRound strokeWidth={1.5} />
                <span className={styles.memberSignal} />
              </div>
            </div>
          ))}

          <div className={styles.hubPosition}>
            <span className={styles.hubHalo} />
            <div className={styles.hub}>
              <UsersRound size={32} strokeWidth={1.5} />
              <span>Tvůj tým</span>
            </div>
          </div>

          <div className={`${styles.floatingCard} ${styles.activityCard}`}>
            <span className={styles.cardIcon}><Activity size={14} /></span>
            <div><span className={styles.cardLabel}>Aktivita týmu</span><span className={styles.skeletonLine} /></div>
            <span className={styles.miniBars}>{[10, 17, 13, 23, 19].map((height, index) => <i key={index} style={{ height, animationDelay: `${index * -0.25}s` }} />)}</span>
          </div>
          <div className={`${styles.floatingCard} ${styles.productionCard}`}>
            <span className={styles.cardIcon}><ChartNoAxesCombined size={14} /></span>
            <div><span className={styles.cardLabel}>Produkce</span><span className={styles.skeletonLine} /></div>
            <svg className={styles.sparkline} viewBox="0 0 44 28" fill="none"><path d="M2 24 L12 17 L21 20 L32 9 L42 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span className={styles.networkCaption}><Network size={12} /> Všechno se propojuje</span>
        </div>

        <div className={styles.copy}>
          <h1 id={titleId}>Lidé. Souvislosti.<br /><span>Tvůj tým v jednom přehledu.</span></h1>
          <p>Připravujeme aktuální přehled členů, jejich aktivity a výsledků.</p>
        </div>

        <div className={styles.loading}>
          <div className={styles.track} role="progressbar" aria-label="Načítání přehledu týmu" aria-valuetext={STAGES[phase]}>
            <span />
          </div>
          <p className={styles.loadingLabel} role="status" aria-live="polite" aria-atomic="true">
            <span className={styles.loadingDots} aria-hidden="true"><i /><i /><i /></span>
            <span key={phase} className={styles.stage}>{STAGES[phase]}</span>
          </p>
        </div>
      </div>

      <footer className={styles.footer} aria-hidden="true">
        {FEATURES.map(({ label, icon: Icon }, index) => <span key={label} className={styles.feature} data-active={index === phase}><Icon size={14} strokeWidth={1.7} />{label}</span>)}
      </footer>
    </section>
  );
}
