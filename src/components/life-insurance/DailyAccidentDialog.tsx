"use client";

import { Bandage, CalendarCheck, CalendarDays, ShieldPlus, TrendingUp, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { DAILY_ACCIDENT_COPY, DAILY_ACCIDENT_SOURCES } from "./dailyAccidentCopy";
import styles from "./sickLeave.module.css";
import accidentStyles from "./dailyAccident.module.css";

const ADVANTAGE_ICONS = [ShieldPlus, CalendarCheck, TrendingUp];
const PROGRESSION_RATES = [100, 200, 300, 400, 500];

type DailyAccidentDialogProps = {
  locale: OnlineCardLocale;
  theme: "dark" | "light";
  onClose: () => void;
  onMeeting?: () => void;
};

export function DailyAccidentDialog({ locale, theme, onClose, onMeeting }: DailyAccidentDialogProps) {
  const copy = DAILY_ACCIDENT_COPY[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const money = (amount: number) => new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : locale === "uk" ? "uk-UA" : "en-GB", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(amount);

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

  return <dialog id="daily-accident-dialog" ref={dialogRef} className={styles.dialog} data-theme={theme} aria-labelledby="daily-accident-title" onCancel={onClose}>
    <div className={styles.panel}>
      <header className={styles.header}>
        <div><p className={styles.kicker}>{copy.kicker}</p><h2 id="daily-accident-title" className={styles.title}>{copy.title}</h2></div>
        <button type="button" className={styles.close} aria-label={copy.close} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className={styles.content}>
        <div className={accidentStyles.intro}>
          <div><p className={styles.badge}><Bandage size={17} aria-hidden="true" />{copy.badge}</p><p className={styles.lead}>{copy.intro}</p></div>
          <Image src="/images/life-insurance/daily-accident-recovery-transparent.webp" alt="" width={1200} height={800} sizes="(max-width: 639px) calc(100vw - 32px), 430px" className={accidentStyles.illustration} />
        </div>
        <section className={styles.section}>
          <h3>{copy.calculationTitle}</h3><p className={styles.paragraph}>{copy.calculation}</p>
          <p className={accidentStyles.formula}>{copy.formula}</p><p className={styles.paragraph}>{copy.formulaNote}</p>
        </section>
        <section className={styles.section}>
          <h3>{copy.timingTitle}</h3>
          <div className={styles.twoColumns}>
            <div className={styles.card}><h4>{copy.modernTitle}</h4><p>{copy.modernText}</p></div>
            <div className={styles.card}><h4>{copy.olderTitle}</h4><p>{copy.olderText}</p></div>
          </div>
        </section>
        <aside className={accidentStyles.recommendation}>
          <p className={styles.kicker}>{copy.recommendationKicker}</p><h3>{copy.recommendationTitle}</h3><p className={styles.paragraph}>{copy.recommendation}</p>
          <ul className={accidentStyles.advantages}>{copy.advantages.map(([title, description], index) => {
            const Icon = ADVANTAGE_ICONS[index];
            return <li key={title}><Icon size={23} aria-hidden="true" /><h4>{title}</h4><p>{description}</p></li>;
          })}</ul>
        </aside>
        <section className={styles.section} aria-labelledby="daily-accident-progression-title">
          <h3 id="daily-accident-progression-title">{copy.progressionTitle}</h3><p className={styles.paragraph}>{copy.progression}</p>
          <table className={accidentStyles.table} aria-labelledby="daily-accident-progression-title">
            <thead><tr><th scope="col">{copy.daysHeading}</th><th scope="col">{copy.rateHeading}</th></tr></thead>
            <tbody>{PROGRESSION_RATES.map((rate, index) => <tr key={rate}><td>{copy.periods[index]}</td><td>{rate} %</td></tr>)}</tbody>
          </table>
          <p className={styles.paragraph}>{copy.progressionNote}</p>
          <div className={styles.example}>
            <h4>{copy.exampleTitle}</h4>
            <div className={styles.twoColumns}>
              <div className={styles.exampleResult}><span>{copy.withoutProgression}</span><strong>{money(30000)}</strong></div>
              <div className={styles.exampleResult}><span>{copy.withProgression}</span><strong>{money(36000)}</strong></div>
            </div>
            <p className={styles.paragraph}>{copy.exampleCalculation}</p><p className={styles.paragraph}>{copy.exampleNote}</p>
          </div>
        </section>
        <section className={styles.section}><h3>{copy.checkTitle}</h3><ul className={styles.checks}>{copy.checks.map(([title, description]) => <li key={title}><h4>{title}</h4><p>{description}</p></li>)}</ul></section>
        <div className={styles.sources}>
          <a href={DAILY_ACCIDENT_SOURCES.product} target="_blank" rel="noreferrer noopener">{copy.productSource}</a>
          <a href={`${DAILY_ACCIDENT_SOURCES.terms}#page=52`} target="_blank" rel="noreferrer noopener">{copy.termsSource}</a>
        </div>
        {onMeeting && <div className={styles.actions}><button type="button" className={styles.primary} onClick={onMeeting}><CalendarDays size={18} aria-hidden="true" />{copy.meetingCta}</button></div>}
      </div>
    </div>
  </dialog>;
}
