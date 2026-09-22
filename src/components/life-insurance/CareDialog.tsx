"use client";

import { Accessibility, Bath, Building2, HandHeart, House, PersonStanding, Shirt, Utensils } from "lucide-react";
import { useEffect, useRef } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { RiskDetailHeader, RiskDetailHero, RiskDetailMeeting } from "./RiskDetailPresentation";
import { CARE_COPY, CARE_SOURCES } from "./careCopy";
import styles from "./sickLeave.module.css";
import careStyles from "./care.module.css";

const NEED_ICONS = [PersonStanding, Bath, Shirt, Utensils];
const REASON_ICONS = [House, HandHeart, Accessibility, Building2];

type CareDialogProps = {
  locale: OnlineCardLocale;
  theme: "dark" | "light";
  onClose: () => void;
  onMeeting?: () => void;
};

export function CareDialog({ locale, theme, onClose, onMeeting }: CareDialogProps) {
  const copy = CARE_COPY[locale];
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

  return <dialog id="care-dialog" ref={dialogRef} className={styles.dialog} data-theme={theme} aria-labelledby="care-title" onCancel={onClose}>
    <div className={styles.panel}>
      <RiskDetailHeader kicker={copy.kicker} closeLabel={copy.close} onClose={onClose} />
      <div className={styles.content}>
        <RiskDetailHero risk="care" title={copy.title} intro={copy.intro} />
        <aside className={styles.recommendation} aria-labelledby="care-state-support-title">
          <h3 id="care-state-support-title">{copy.stateSupportTitle}</h3>
          <p>{copy.stateSupportText}</p><p>{copy.stateSupportImpact}</p>
          <div className={styles.sources}><a href={CARE_SOURCES.assessment} target="_blank" rel="noreferrer noopener">{copy.stateSupportSource}</a></div>
        </aside>
        <section className={styles.featuredExample}>
          <div>
            <h3>{copy.definitionTitle}</h3><p className={styles.paragraph}>{copy.definitionText}</p>
            <div className={styles.sources}><a href={CARE_SOURCES.assessment} target="_blank" rel="noreferrer noopener">{copy.assessmentSource}</a></div>
          </div>
          <ul className={careStyles.needs}>{copy.needs.map((need, index) => {
            const Icon = NEED_ICONS[index];
            return <li key={need}><Icon size={24} aria-hidden="true" /><span>{need}</span></li>;
          })}</ul>
        </section>
        <aside className={styles.recommendation} aria-labelledby="care-scope-title">
          <h3 id="care-scope-title">{copy.scopeTitle}</h3><p>{copy.scopeText}</p>
          <div className={styles.sources}><a href={CARE_SOURCES.pension} target="_blank" rel="noreferrer noopener">{copy.scopeSource}</a></div>
        </aside>
        <section className={styles.section} aria-labelledby="care-reasons-title">
          <h3 id="care-reasons-title">{copy.reasonsTitle}</h3>
          <ul className={`${styles.twoColumns} ${careStyles.reasons}`}>
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
          <h3>{copy.paymentTitle}</h3>
          <div className={styles.twoColumns}>
            <div className={styles.card}><h4>{copy.lumpSumTitle}</h4><p>{copy.lumpSumText}</p><div className={styles.sources}><a href={CARE_SOURCES.lumpSum} target="_blank" rel="noreferrer noopener">{copy.lumpSumSource}</a></div></div>
            <div className={styles.card}><h4>{copy.pensionTitle}</h4><p>{copy.pensionText}</p><div className={styles.sources}><a href={CARE_SOURCES.pension} target="_blank" rel="noreferrer noopener">{copy.pensionSource}</a></div></div>
          </div>
          <p className={styles.paragraph}>{copy.paymentNote}</p>
        </section>
        <section className={styles.section}>
          <h3>{copy.checksTitle}</h3>
          <ul className={styles.checks}>{copy.checks.map(([title, description]) => <li key={title}><h4>{title}</h4><p>{description}</p></li>)}</ul>
        </section>
        <aside className={styles.recommendation}><h3>{copy.planningTitle}</h3><p>{copy.planningText}</p></aside>
        {onMeeting && <RiskDetailMeeting label={copy.meetingCta} onClick={onMeeting} />}
      </div>
    </div>
  </dialog>;
}
