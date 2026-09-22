"use client";

import { Flower2, GraduationCap, HandHeart, House, WalletCards } from "lucide-react";
import { useEffect, useRef } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { DEATH_COPY, DEATH_SOURCE } from "./deathCopy";
import { RiskDetailHeader, RiskDetailHero, RiskDetailMeeting } from "./RiskDetailPresentation";
import styles from "./sickLeave.module.css";
import deathStyles from "./death.module.css";

const BENEFIT_ICONS = [Flower2, House, WalletCards, GraduationCap, HandHeart];

type DeathDialogProps = {
  locale: OnlineCardLocale;
  theme: "dark" | "light";
  onClose: () => void;
  onMeeting?: () => void;
};

export function DeathDialog({ locale, theme, onClose, onMeeting }: DeathDialogProps) {
  const copy = DEATH_COPY[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog id="death-dialog" ref={dialogRef} className={styles.dialog} data-theme={theme} aria-labelledby="death-title" onCancel={onClose}>
    <div className={styles.panel}>
      <RiskDetailHeader kicker={copy.kicker} closeLabel={copy.close} onClose={onClose} />
      <div className={styles.content}>
        <RiskDetailHero risk="death" title={copy.title} intro={copy.intro} />
        <ul className={deathStyles.benefits}>
          {copy.benefits.map(([title, description], index) => {
            const Icon = BENEFIT_ICONS[index];
            return <li key={title} className={deathStyles.benefit}>
              <span className={deathStyles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <Icon size={22} aria-hidden="true" />
              <div><h3>{title}</h3><p>{description}</p></div>
            </li>;
          })}
        </ul>
        <aside className={styles.recommendation}><h3>{copy.amountTitle}</h3><p>{copy.amountText}</p></aside>
        <section className={styles.section}>
          <h3>{copy.beneficiaryTitle}</h3>
          <p className={styles.paragraph}>{copy.beneficiaryText}</p>
          <p className={styles.paragraph}>{copy.termsText}</p>
          <div className={styles.sources}><a href={DEATH_SOURCE} target="_blank" rel="noreferrer noopener">{copy.source}</a></div>
        </section>
        {onMeeting && <RiskDetailMeeting label={copy.meetingCta} onClick={onMeeting} />}
      </div>
    </div>
  </dialog>;
}
