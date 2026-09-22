"use client";

import { HandHeart, Sprout, TrendingUp } from "lucide-react";
import { useEffect, useRef } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { HOSPITALISATION_COPY, HOSPITALISATION_SOURCES } from "./hospitalisationCopy";
import { RiskDetailHeader, RiskDetailHero, RiskDetailMeeting } from "./RiskDetailPresentation";
import styles from "./sickLeave.module.css";

type HospitalisationDialogProps = {
  locale: OnlineCardLocale;
  theme: "dark" | "light";
  onClose: () => void;
  onMeeting?: () => void;
};

export function HospitalisationDialog({ locale, theme, onClose, onMeeting }: HospitalisationDialogProps) {
  const copy = HOSPITALISATION_COPY[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const exampleBenefit = new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : locale === "uk" ? "uk-UA" : "en-GB", {
    style: "currency", currency: "CZK", maximumFractionDigits: 0,
  }).format(5_000);

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

  return <dialog id="hospitalisation-dialog" ref={dialogRef} className={styles.dialog} data-theme={theme} aria-labelledby="hospitalisation-title" onCancel={onClose}>
    <div className={styles.panel}>
      <RiskDetailHeader kicker={copy.kicker} closeLabel={copy.close} onClose={onClose} />
      <div className={styles.content}>
        <RiskDetailHero risk="hospitalisation" title={copy.title} intro={copy.intro} />
        <section className={styles.featuredExample}>
          <div><h3>{copy.dailyTitle}</h3><p className={styles.paragraph}>{copy.dailyText}</p></div>
          <div className={styles.exampleResult}>
            <span>{copy.example}</span><strong>{exampleBenefit}</strong>
            <p className={styles.hint}>{copy.exampleNote}</p>
          </div>
        </section>
        <div className={styles.twoColumns}>
          <section className={styles.card}>
            <span className={styles.cardIcon}><TrendingUp size={24} aria-hidden="true" /></span>
            <h3 className="text-base font-semibold leading-snug">{copy.progressionTitle}</h3><p>{copy.progressionText}</p>
            <div className={styles.sources}><a href={HOSPITALISATION_SOURCES.flexi} target="_blank" rel="noreferrer noopener">{copy.flexiSource}</a></div>
          </section>
          <section className={styles.card}>
            <span className={styles.cardIcon}><Sprout size={24} aria-hidden="true" /></span>
            <h3 className="text-base font-semibold leading-snug">{copy.spaTitle}</h3><p>{copy.spaText}</p>
            <div className={styles.sources}><a href={HOSPITALISATION_SOURCES.spa} target="_blank" rel="noreferrer noopener">{copy.spaSource}</a></div>
          </section>
        </div>
        <section className={`${styles.section} ${styles.card}`}>
          <span className={styles.cardIcon}><HandHeart size={24} aria-hidden="true" /></span>
          <h3>{copy.accompanimentTitle}</h3><p className={styles.paragraph}>{copy.accompanimentText}</p>
          <div className={styles.sources}><a href={HOSPITALISATION_SOURCES.accompaniment} target="_blank" rel="noreferrer noopener">{copy.accompanimentSource}</a></div>
        </section>
        <section className={styles.section}>
          <h3>{copy.checkTitle}</h3>
          <ul className={styles.checks}>{copy.checks.map(([title, description]) => <li key={title}><h4>{title}</h4><p>{description}</p></li>)}</ul>
        </section>
        <aside className={styles.recommendation}><h3>{copy.recoveryTitle}</h3><p>{copy.recoveryText}</p></aside>
        {onMeeting && <RiskDetailMeeting label={copy.meetingCta} onClick={onMeeting} />}
      </div>
    </div>
  </dialog>;
}
