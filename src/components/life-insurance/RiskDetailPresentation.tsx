import Image from "next/image";
import { ArrowUpRight, CalendarDays, ShieldCheck, X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./sickLeave.module.css";

type Risk = "death" | "disability" | "care" | "serious-illness" | "daily-accident" | "permanent-injury" | "sick-leave" | "hospitalisation";

export function RiskDetailHeader({ kicker, closeLabel, onClose }: {
  kicker: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return <header className={styles.header}>
    <p className={styles.headerLabel}><span className={styles.headerMark}><ShieldCheck size={18} aria-hidden="true" /></span><span className={styles.kicker}>{kicker}</span></p>
    <button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}><X size={20} aria-hidden="true" /></button>
  </header>;
}

export function RiskDetailHero({ risk, title, intro, badge, compact = false }: {
  risk: Risk;
  title: string;
  intro?: string;
  badge?: ReactNode;
  compact?: boolean;
}) {
  const photograph = risk === "death";
  const wideIllustration = risk === "daily-accident";
  const src = photograph ? "/images/life-insurance/family-protection-hero-v1.webp"
    : wideIllustration ? "/images/life-insurance/daily-accident-recovery-transparent.webp"
    : `/images/life-insurance/risks/${risk}-v2.webp`;

  return <div className={`${styles.hero} ${compact ? styles.heroCompact : ""}`}>
    <div className={styles.heroHeading}>
      {badge && <p className={styles.badge}>{badge}</p>}
      <h2 id={`${risk}-title`} className={styles.title}>{title}</h2>
    </div>
    <div className={`${styles.heroArt} ${photograph ? styles.heroPhotograph : ""} ${wideIllustration ? styles.heroWideArt : ""}`} aria-hidden="true">
      <Image src={src} alt="" width={photograph ? 1168 : wideIllustration ? 1200 : 384} height={photograph ? 880 : wideIllustration ? 800 : 384}
        sizes={compact ? "80px" : "(max-width: 639px) 180px, (max-width: 1100px) 36vw, 420px"} className={styles.heroImage} />
    </div>
    {intro && <p className={styles.lead}>{intro}</p>}
  </div>;
}

export function RiskDetailMeeting({ label, onClick }: { label: string; onClick: () => void }) {
  return <div className={styles.meetingAction}>
    <button type="button" onClick={onClick}>
      <CalendarDays className={styles.meetingIcon} size={22} aria-hidden="true" />
      <span>{label}</span>
      <span className={styles.meetingArrow}><ArrowUpRight size={24} aria-hidden="true" /></span>
    </button>
  </div>;
}
