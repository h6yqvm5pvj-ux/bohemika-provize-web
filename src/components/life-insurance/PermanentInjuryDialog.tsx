"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { calculatePermanentInjuryBenefit } from "@/lib/permanentInjuryBenefit";
import { PERMANENT_INJURY_COPY, PERMANENT_INJURY_SOURCES } from "./permanentInjuryCopy";
import { RiskDetailHeader, RiskDetailHero, RiskDetailMeeting } from "./RiskDetailPresentation";
import styles from "./sickLeave.module.css";
import injuryStyles from "./permanentInjury.module.css";

const INSURED_AMOUNTS = [300_000, 500_000, 1_000_000, 2_000_000];
const EXAMPLE_PERCENTAGES = [10, 26, 50, 100];
const PROGRESSION_MULTIPLIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function PermanentInjuryModel({ locale }: { locale: OnlineCardLocale }) {
  const copy = PERMANENT_INJURY_COPY[locale];
  const [insuredAmount, setInsuredAmount] = useState(500_000);
  const [assessedPercent, setAssessedPercent] = useState(26);
  const benefit = calculatePermanentInjuryBenefit(insuredAmount, assessedPercent);
  const money = (amount: number) => new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : locale === "uk" ? "uk-UA" : "en-GB", {
    style: "currency", currency: "CZK", maximumFractionDigits: 0,
  }).format(amount);

  if (!benefit) return null;

  return (
    <section className={injuryStyles.model} aria-labelledby="permanent-injury-model-title">
      <h3 id="permanent-injury-model-title">{copy.modelTitle}</h3>
      <p id="permanent-injury-model-description" className={styles.paragraph}>{copy.modelIntro}</p>
      <label className={injuryStyles.field} htmlFor="permanent-injury-amount">
        {copy.amount}
        <select id="permanent-injury-amount" value={insuredAmount} onChange={event => setInsuredAmount(Number(event.target.value))}>
          {INSURED_AMOUNTS.map(amount => <option key={amount} value={amount}>{money(amount)}</option>)}
        </select>
      </label>
      <label className={injuryStyles.field} htmlFor="permanent-injury-percent">
        <span className={injuryStyles.rangeLabel}><span>{copy.percent}</span><strong>{assessedPercent} %</strong></span>
        <input id="permanent-injury-percent" className={injuryStyles.slider} type="range" min={1} max={100} step={1}
          value={assessedPercent} onChange={event => setAssessedPercent(Number(event.target.value))}
          aria-valuetext={`${assessedPercent} %`} aria-describedby="permanent-injury-model-description" />
      </label>
      <div className={injuryStyles.presets} role="group" aria-label={copy.presetLabel}>
        {EXAMPLE_PERCENTAGES.map(percent => <button key={percent} type="button" aria-pressed={percent === assessedPercent} onClick={() => setAssessedPercent(percent)}>{percent} %</button>)}
      </div>
      <div aria-live="polite" aria-atomic="true">
        <dl className={injuryStyles.comparison}>
          <div className={injuryStyles.comparisonRow}>
            <dt>{copy.baseLabel}</dt><dd data-permanent-injury-result="base">{money(benefit.baseBenefit)}</dd>
            <dd className={injuryStyles.bar} aria-hidden="true"><span style={{ width: `${100 / benefit.multiplier}%` }} /></dd>
          </div>
          <div className={injuryStyles.comparisonRow}>
            <dt>{copy.progressiveLabel}</dt><dd data-permanent-injury-result="progressive">{money(benefit.progressiveBenefit)}</dd>
            <dd className={injuryStyles.bar} aria-hidden="true"><span style={{ width: "100%" }} /></dd>
          </div>
        </dl>
        <p className={injuryStyles.multiplier}>{copy.multiplier}: <span data-permanent-injury-result="multiplier">{benefit.multiplier}×</span></p>
        <p className={injuryStyles.formula}>{copy.formula}<br />{money(insuredAmount)} × {assessedPercent} % × {benefit.multiplier} = {money(benefit.progressiveBenefit)}</p>
      </div>
      <p className={styles.paragraph}>{copy.modelNote}</p>
      <details className={styles.details}>
        <summary id="permanent-injury-table-title">{copy.tableTitle}</summary>
        <table className={injuryStyles.table} aria-labelledby="permanent-injury-table-title">
          <thead><tr><th scope="col">{copy.rangeHeading}</th><th scope="col">{copy.multiplierHeading}</th></tr></thead>
          <tbody>{PROGRESSION_MULTIPLIERS.map(multiplier => <tr key={multiplier}>
            <td>{multiplier === 1 ? copy.firstRange : copy.range.replace("{from}", String((multiplier - 1) * 10)).replace("{to}", String(multiplier * 10))}</td>
            <td>{multiplier}×</td>
          </tr>)}</tbody>
        </table>
        <p className={styles.paragraph}>{copy.tableNote}</p>
      </details>
      <div className={styles.sources}><a href={PERMANENT_INJURY_SOURCES.terms} target="_blank" rel="noreferrer noopener">{copy.termsSource}</a></div>
    </section>
  );
}

type PermanentInjuryDialogProps = {
  locale: OnlineCardLocale;
  theme: "dark" | "light";
  onClose: () => void;
  onMeeting?: () => void;
};

export function PermanentInjuryDialog({ locale, theme, onClose, onMeeting }: PermanentInjuryDialogProps) {
  const copy = PERMANENT_INJURY_COPY[locale];
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

  return (
    <dialog id="permanent-injury-dialog" ref={dialogRef} className={styles.dialog} data-theme={theme} aria-labelledby="permanent-injury-title" onCancel={onClose}>
      <div className={styles.panel}>
        <RiskDetailHeader kicker={copy.kicker} closeLabel={copy.close} onClose={onClose} />
        <div className={styles.content}>
          <RiskDetailHero risk="permanent-injury" title={copy.title} intro={copy.intro} badge={<><ShieldCheck size={16} aria-hidden="true" />{copy.badge}</>} />
          <div className={styles.twoColumns}>
            <section className={styles.card}><h3 className={injuryStyles.cardTitle}>{copy.assessmentTitle}</h3><p>{copy.assessmentText}</p></section>
            <section className={styles.card}><h3 className={injuryStyles.cardTitle}>{copy.progressionTitle}</h3><p>{copy.progressionText}</p></section>
          </div>
          <section className={styles.section}>
            <h3>{copy.thresholdTitle}</h3>
            <div className={styles.twoColumns}>
              <div className={styles.card}><h4>{copy.lowThresholdTitle}</h4><p>{copy.lowThresholdText}</p></div>
              <div className={styles.card}><h4>{copy.highThresholdTitle}</h4><p>{copy.highThresholdText}</p></div>
            </div>
          </section>
          <section className={styles.section}>
            <h3>{copy.optionsTitle}</h3>
            <ul className={injuryStyles.options}><li>{copy.noProgression}</li>{[4, 5, 6, 8, 10].map(multiplier => <li key={multiplier}>{multiplier}×</li>)}</ul>
            <p className={styles.paragraph}>{copy.optionsText}</p>
          </section>
          <aside className={styles.recommendation}><h3>{copy.advisorTitle}</h3><p>{copy.advisorText}</p></aside>
          <section className={styles.section}>
            <p className={styles.kicker}>{copy.recommendationKicker}</p>
            <h3 className={injuryStyles.recommendationTitle}>{copy.recommendationTitle}</h3><p className={styles.paragraph}>{copy.recommendationText}</p>
            <ul className={injuryStyles.advantages}>{copy.advantages.map(([title, description]) => <li key={title}><strong>{title}</strong><p>{description}</p></li>)}</ul>
            <div className={styles.sources}><a href={PERMANENT_INJURY_SOURCES.comparison} target="_blank" rel="noreferrer noopener">{copy.comparisonSource}</a></div>
          </section>
          <PermanentInjuryModel locale={locale} />
          <section className={styles.section}>
            <h3>{copy.faqTitle}</h3>
            {copy.faqs.map(([question, answer]) => <details key={question} className={styles.details}><summary>{question}</summary><p className={styles.paragraph}>{answer}</p></details>)}
          </section>
          {onMeeting && <RiskDetailMeeting label={copy.meetingCta} onClick={onMeeting} />}
        </div>
      </div>
    </dialog>
  );
}
