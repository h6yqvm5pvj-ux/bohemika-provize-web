"use client";

import Image from "next/image";
import { Calculator, CalendarDays, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { DISABILITY_COPY, DISABILITY_SOURCES } from "./disabilityCopy";
import styles from "./sickLeave.module.css";
import disabilityStyles from "./disability.module.css";

const BUDGET_YEARS = [1, 5, 10, 20] as const;
const BENEFIT_ILLUSTRATIONS = ["income", "home", "aids", "health"] as const;

function parseMonthlyAmount(value: string): number | null {
  const amount = Number(value);
  return value.trim() !== "" && Number.isSafeInteger(amount) && amount >= 0 && amount <= 1_000_000 ? amount : null;
}

function DisabilityBudget({ locale }: { locale: OnlineCardLocale }) {
  const copy = DISABILITY_COPY[locale];
  const [expensesInput, setExpensesInput] = useState("30000");
  const [incomeInput, setIncomeInput] = useState("15000");
  const [years, setYears] = useState(10);
  const expenses = parseMonthlyAmount(expensesInput);
  const income = parseMonthlyAmount(incomeInput);
  const gap = expenses !== null && income !== null ? Math.max(0, expenses - income) : null;
  const coveredPercent = expenses && income !== null ? Math.min(100, income / expenses * 100) : 0;
  const money = (amount: number) => new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : locale === "uk" ? "uk-UA" : "en-GB", {
    style: "currency", currency: "CZK", maximumFractionDigits: 0,
  }).format(amount);

  return (
    <section className={disabilityStyles.budget} aria-labelledby="disability-budget-title">
      <div className={disabilityStyles.budgetHeading}>
        <Calculator size={24} aria-hidden="true" />
        <h3 id="disability-budget-title">{copy.budgetTitle}</h3>
      </div>
      <p className={styles.paragraph}>{copy.budgetIntro}</p>
      <div className={disabilityStyles.inputs}>
        <label className={disabilityStyles.field} htmlFor="disability-expenses">
          {copy.expenses}
          <input id="disability-expenses" type="number" inputMode="numeric" min={0} max={1_000_000} step={1}
            value={expensesInput} onChange={event => setExpensesInput(event.target.value)}
            aria-invalid={expenses === null} aria-describedby={`disability-expenses-hint${expenses === null ? " disability-budget-error" : ""}`} />
          <span id="disability-expenses-hint" className={styles.hint}>{copy.expensesHint}</span>
        </label>
        <label className={disabilityStyles.field} htmlFor="disability-income">
          {copy.income}
          <input id="disability-income" type="number" inputMode="numeric" min={0} max={1_000_000} step={1}
            value={incomeInput} onChange={event => setIncomeInput(event.target.value)}
            aria-invalid={income === null} aria-describedby={`disability-income-hint${income === null ? " disability-budget-error" : ""}`} />
          <span id="disability-income-hint" className={styles.hint}>{copy.incomeHint}</span>
        </label>
      </div>
      <label className={`${disabilityStyles.field} ${disabilityStyles.horizon}`} htmlFor="disability-years">
        {copy.horizon}
        <select id="disability-years" value={years} onChange={event => setYears(Number(event.target.value))}>
          {BUDGET_YEARS.map((value, index) => <option key={value} value={value}>{copy.years[index]}</option>)}
        </select>
      </label>
      <div aria-live="polite" aria-atomic="true">
        {gap === null ? <p id="disability-budget-error" className={styles.error}>{copy.invalidAmount}</p> : <>
          <dl className={disabilityStyles.results}>
            <div><dt>{copy.monthlyGap}</dt><dd data-disability-result="monthly">{money(gap)}</dd></div>
            <div><dt>{copy.totalGap}</dt><dd data-disability-result="total">{money(gap * 12 * years)}</dd></div>
          </dl>
          <p className={disabilityStyles.formula}>{copy.calculation}: {money(gap)} × 12 × {years}</p>
          {gap === 0 && <p className={styles.paragraph}>{copy.noGap}</p>}
        </>}
      </div>
      {gap !== null && expenses !== null && expenses > 0 && <>
        <div className={disabilityStyles.bar} aria-hidden="true">
          <span className={disabilityStyles.barCovered} style={{ width: `${coveredPercent}%` }} />
          <span className={disabilityStyles.barGap} style={{ width: `${100 - coveredPercent}%` }} />
        </div>
        <div className={disabilityStyles.legend}>
          <span><i className={disabilityStyles.barCovered} aria-hidden="true" />{copy.covered}</span>
          <span><i className={disabilityStyles.barGap} aria-hidden="true" />{copy.uncovered}</span>
        </div>
      </>}
      <p className={styles.paragraph}>{copy.budgetNote}</p>
    </section>
  );
}

type DisabilityDialogProps = {
  locale: OnlineCardLocale;
  theme: "dark" | "light";
  onClose: () => void;
  onMeeting?: () => void;
};

export function DisabilityDialog({ locale, theme, onClose, onMeeting }: DisabilityDialogProps) {
  const copy = DISABILITY_COPY[locale];
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
    <dialog id="disability-dialog" ref={dialogRef} className={styles.dialog} data-theme={theme} aria-labelledby="disability-title" onCancel={onClose}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <div><p className={styles.kicker}>{copy.kicker}</p><h2 id="disability-title" className={styles.title}>{copy.title}</h2></div>
          <button type="button" className={styles.close} aria-label={copy.close} onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className={styles.content}>
          <p className={styles.badge}><ShieldCheck size={17} aria-hidden="true" />{copy.badge}</p>
          <p className={styles.lead}>{copy.intro}</p>
          <ul className={disabilityStyles.benefits}>
            {copy.benefits.map(([title, description], index) => (
              <li key={title}>
                <div className={disabilityStyles.benefitHeading}>
                  <h3>{title}</h3>
                  <Image
                    src={`/images/life-insurance/disability-${BENEFIT_ILLUSTRATIONS[index]}.webp`}
                    alt=""
                    aria-hidden="true"
                    width={640}
                    height={640}
                    sizes="(max-width: 639px) 104px, 128px"
                    className={disabilityStyles.benefitIllustration}
                  />
                </div>
                <p>{description}</p>
                {index === 3 && <a className={disabilityStyles.causeSource} href={DISABILITY_SOURCES.causes} target="_blank" rel="noreferrer noopener">{copy.causesSource}</a>}
              </li>
            ))}
          </ul>
          <section className={styles.section} aria-labelledby="disability-degrees-title">
            <h3 id="disability-degrees-title">{copy.degreesTitle}</h3>
            <p className={styles.paragraph}>{copy.degreesIntro}</p>
            <ol className={disabilityStyles.degrees}>
              {copy.degrees.map((degree, index) => <li key={degree} className={disabilityStyles.degree}>
                <h4>{degree}</h4><strong>{["35–49 %", "50–69 %", copy.highestDegree][index]}</strong><p>{copy.capacityDrop}</p>
              </li>)}
            </ol>
            <p className={styles.paragraph}>{copy.degreesNote}</p>
          </section>
          <section className={styles.section}>
            <h3>{copy.supportTitle}</h3>
            <div className={styles.twoColumns}>
              <div className={styles.card}><h4>{copy.stateTitle}</h4><p>{copy.stateText}</p></div>
              <div className={styles.card}><h4>{copy.insuranceTitle}</h4><p>{copy.insuranceText}</p></div>
            </div>
          </section>
          <aside className={styles.recommendation}><h3>{copy.recommendationTitle}</h3><p>{copy.recommendationText}</p></aside>
          <DisabilityBudget locale={locale} />
          <section className={styles.section}>
            <h3>{copy.faqTitle}</h3>
            {copy.faqs.map(([question, answer]) => <details key={question} className={styles.details}><summary>{question}</summary><p className={styles.paragraph}>{answer}</p></details>)}
          </section>
          <div className={styles.sources}>
            <a href={DISABILITY_SOURCES.pension} target="_blank" rel="noreferrer noopener">{copy.pensionSource}</a>
            <a href={DISABILITY_SOURCES.degrees} target="_blank" rel="noreferrer noopener">{copy.degreesSource}</a>
          </div>
          {onMeeting && <div className={styles.actions}><button type="button" className={styles.primary} onClick={onMeeting}><CalendarDays size={18} aria-hidden="true" />{copy.meetingCta}</button></div>}
        </div>
      </div>
    </dialog>
  );
}
