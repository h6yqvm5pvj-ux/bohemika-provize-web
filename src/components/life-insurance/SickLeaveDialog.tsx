"use client";

import { BadgeCheck, Calculator } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { SickLeaveCalculator } from "./SickLeaveCalculator";
import { SICK_LEAVE_COPY, SICK_LEAVE_SOURCES } from "./sickLeaveCopy";
import { RiskDetailHeader, RiskDetailHero, RiskDetailMeeting } from "./RiskDetailPresentation";
import styles from "./sickLeave.module.css";

type SickLeaveDialogProps = {
  locale: OnlineCardLocale;
  theme: "dark" | "light";
  onClose: () => void;
  onMeeting?: () => void;
};

export function SickLeaveDialog({ locale, theme, onClose, onMeeting }: SickLeaveDialogProps) {
  const copy = SICK_LEAVE_COPY[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const calculatorTabRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<"overview" | "calculator">("overview");
  const money = (value: number) => new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : locale === "uk" ? "uk-UA" : "en-GB", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);

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

  const changeTab = (next: typeof tab) => {
    setTab(next);
    contentRef.current?.scrollTo({ top: 0 });
  };
  const showCalculator = () => {
    changeTab("calculator");
    calculatorTabRef.current?.focus({ preventScroll: true });
  };

  return <dialog id="sick-leave-dialog" ref={dialogRef} className={styles.dialog} data-theme={theme} aria-labelledby="sick-leave-title" onCancel={onClose}>
    <div className={styles.panel}>
      <RiskDetailHeader kicker={copy.kicker} closeLabel={copy.close} onClose={onClose} />
      <div className={styles.tabs} role="group" aria-label={copy.tabs}>
        <button type="button" aria-pressed={tab === "overview"} aria-controls="sick-leave-overview" onClick={() => changeTab("overview")}>{copy.overview}</button>
        <button ref={calculatorTabRef} type="button" aria-pressed={tab === "calculator"} aria-controls="sick-leave-calculator" onClick={() => changeTab("calculator")}>{copy.calculator}</button>
      </div>
      <div ref={contentRef} className={styles.content}>
        <RiskDetailHero risk="sick-leave" title={copy.title} intro={tab === "overview" ? copy.intro : undefined} compact={tab === "calculator"} badge={tab === "overview" ? <><BadgeCheck size={16} aria-hidden="true" />{copy.badge}</> : undefined} />
        <div id="sick-leave-overview" hidden={tab !== "overview"}>
          <p className={styles.paragraph}>{copy.coverage}</p>
          <div className={styles.actions}><button type="button" className={styles.primary} onClick={showCalculator}><Calculator size={18} aria-hidden="true" />{copy.calculateCta}</button></div>
          <section className={styles.section}>
            <h3>{copy.startTitle}</h3>
            <div className={styles.starts}>{copy.starts.map(start => <span key={start}>{start}</span>)}</div>
            <p className={styles.paragraph}>{copy.startText}</p>
            <div className={styles.twoColumns}>
              <div className={styles.card}><h4>{copy.retroTitle}</h4><p>{copy.retroText}</p></div>
              <div className={styles.card}><h4>{copy.followingTitle}</h4><p>{copy.followingText}</p></div>
            </div>
            <div className={styles.example}>
              <h4>{copy.exampleTitle}</h4><p className={styles.paragraph}>{copy.exampleText}</p>
              <div className={styles.twoColumns}>
                <div className={`${styles.exampleResult} ${styles.exampleFeatured}`}><span>{copy.retroExample}</span><strong>{money(15000)}</strong></div>
                <div className={styles.exampleResult}><span>{copy.followingExample}</span><strong>{money(8000)}</strong></div>
              </div>
              <p className={styles.paragraph}>{copy.exampleNote}</p>
            </div>
          </section>
          <aside className={styles.recommendation}><h3>{copy.recommendationTitle}</h3><p>{copy.recommendation}</p><p>{copy.price}</p></aside>
          <section className={styles.section}>
            <h3>{copy.checksTitle}</h3>
            <ul className={styles.checks}>{copy.checks.map(([title, text]) => <li key={title}><h4>{title}</h4><p>{text}</p></li>)}</ul>
          </section>
          <div className={styles.sources}>
            <a href={SICK_LEAVE_SOURCES.cpp} target="_blank" rel="noreferrer noopener">{copy.privateSource}</a>
            <a href={SICK_LEAVE_SOURCES.generali} target="_blank" rel="noreferrer noopener">{copy.otherPrivateSource}</a>
          </div>
        </div>
        <div id="sick-leave-calculator" hidden={tab !== "calculator"}><SickLeaveCalculator locale={locale} /></div>
        {onMeeting && <RiskDetailMeeting label={copy.meetingCta} onClick={onMeeting} />}
      </div>
    </div>
  </dialog>;
}
