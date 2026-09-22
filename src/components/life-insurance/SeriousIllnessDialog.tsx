"use client";

import { CircleAlert, HandHeart, Hourglass, Route, WalletCards } from "lucide-react";
import { useEffect, useRef } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { RiskDetailHeader, RiskDetailHero, RiskDetailMeeting } from "./RiskDetailPresentation";
import { SERIOUS_ILLNESS_COPY, SERIOUS_ILLNESS_SOURCES } from "./seriousIllnessCopy";
import styles from "./sickLeave.module.css";
import illnessStyles from "./seriousIllness.module.css";

const REASON_ICONS = [WalletCards, HandHeart, Route, Hourglass];

type SeriousIllnessDialogProps = {
  locale: OnlineCardLocale;
  theme: "dark" | "light";
  onClose: () => void;
  onMeeting?: () => void;
};

export function SeriousIllnessDialog({ locale, theme, onClose, onMeeting }: SeriousIllnessDialogProps) {
  const copy = SERIOUS_ILLNESS_COPY[locale];
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

  return <dialog id="serious-illness-dialog" ref={dialogRef} className={styles.dialog} data-theme={theme} aria-labelledby="serious-illness-title" onCancel={onClose}>
    <div className={styles.panel}>
      <RiskDetailHeader kicker={copy.kicker} closeLabel={copy.close} onClose={onClose} />
      <div className={styles.content}>
        <RiskDetailHero risk="serious-illness" title={copy.title} intro={copy.intro} />
        <aside className={illnessStyles.warning} data-theme={theme} aria-labelledby="serious-illness-warning-title">
          <div className={illnessStyles.warningHeading}><CircleAlert size={25} aria-hidden="true" /><h3 id="serious-illness-warning-title">{copy.warningTitle}</h3></div>
          <p><strong>{copy.warningText}</strong></p>
          <p className={styles.paragraph}>{copy.warningDetail}</p>
          <div className={styles.sources}><a href={SERIOUS_ILLNESS_SOURCES.definitions} target="_blank" rel="noreferrer noopener">{copy.definitionsSource}</a></div>
        </aside>
        <section className={styles.section} aria-labelledby="serious-illness-reasons-title">
          <h3 id="serious-illness-reasons-title">{copy.reasonsTitle}</h3>
          <ul className={`${styles.twoColumns} ${illnessStyles.reasons}`}>
            {copy.reasons.map(([title, description], index) => {
              const Icon = REASON_ICONS[index];
              return <li key={title} className={styles.card}>
                <span className={styles.cardIcon}><Icon size={24} aria-hidden="true" /></span>
                <h4>{title}</h4><p>{description}</p>
              </li>;
            })}
          </ul>
        </section>
        <section className={styles.section}>
          <h3>{copy.paymentTitle}</h3><p className={styles.paragraph}>{copy.paymentText}</p>
          <div className={styles.sources}><a href={SERIOUS_ILLNESS_SOURCES.benefits} target="_blank" rel="noreferrer noopener">{copy.paymentSource}</a></div>
        </section>
        <section className={styles.section}>
          <h3>{copy.checksTitle}</h3>
          <ul className={styles.checks}>{copy.checks.map(([title, description]) => <li key={title}><h4>{title}</h4><p>{description}</p></li>)}</ul>
        </section>
        <aside className={styles.recommendation}><h3>{copy.amountTitle}</h3><p>{copy.amountText}</p></aside>
        <p className={styles.paragraph}>{copy.sourcesNote}</p>
        {onMeeting && <RiskDetailMeeting label={copy.meetingCta} onClick={onMeeting} />}
      </div>
    </div>
  </dialog>;
}
