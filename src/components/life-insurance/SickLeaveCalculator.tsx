"use client";

import { useState } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { SICK_LEAVE_COPY } from "./sickLeaveCopy";
import { EMPTY_SICKNESS_ESTIMATE, estimateSicknessIncome, SICKNESS_PERIODS, type SicknessEstimateInputs } from "./sicknessEstimate";
import styles from "./sickLeave.module.css";

export function SickLeaveCalculator({ locale }: { locale: OnlineCardLocale }) {
  const copy = SICK_LEAVE_COPY[locale];
  const [input, setInput] = useState<SicknessEstimateInputs>(EMPTY_SICKNESS_ESTIMATE);
  const employee = input.employment === "employee";
  const { errors, result } = estimateSicknessIncome(input);
  const money = (value: number) => new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : locale === "uk" ? "uk-UA" : "en-GB", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
  const update = <K extends keyof SicknessEstimateInputs>(key: K, value: SicknessEstimateInputs[K]) => setInput(previous => ({ ...previous, [key]: value }));
  const field = (key: "grossMonthly" | "hourlyEarnings" | "workingDays" | "hoursPerDay" | "selfEmployedMonthlyBase" | "netMonthly", label: string, hint: string, placeholder: string) => (
    <label className={styles.field} key={key} htmlFor={`public-sickness-${key}`}>
      <span>{label}</span>
      <input id={`public-sickness-${key}`} type="text" inputMode={key === "workingDays" ? "numeric" : "decimal"} value={input[key]} placeholder={placeholder}
        aria-describedby={`public-sickness-${key}-hint${errors.includes(key) ? " public-sickness-error" : ""}`} aria-invalid={errors.includes(key)}
        onChange={event => update(key, event.target.value)} />
      <small id={`public-sickness-${key}-hint`} className={styles.hint}>{hint}</small>
    </label>
  );

  return (
    <section className={styles.calculator} aria-labelledby="sickness-calculator-title">
      <h3 id="sickness-calculator-title" className={styles.calcTitle}>{copy.calcTitle}</h3>
      <p className={styles.paragraph}>{copy.calcIntro}</p>
      <fieldset className={styles.fieldset}>
        <legend>{copy.employment}</legend>
        <div className={styles.choices}>
          <button type="button" aria-pressed={employee} onClick={() => update("employment", "employee")}>{copy.employee}</button>
          <button type="button" aria-pressed={!employee} onClick={() => update("employment", "selfEmployed")}>{copy.selfEmployed}</button>
        </div>
      </fieldset>
      {!employee && <>
        <label className={styles.checkbox}><input type="checkbox" checked={input.insured} onChange={event => update("insured", event.target.checked)} aria-describedby="sickness-insured-hint" /><span>{copy.insured}</span></label>
        <p id="sickness-insured-hint" className={styles.hint}>{copy.insuredHint}</p>
        {!input.insured && <p className={styles.notice}>{copy.uninsured}</p>}
      </>}
      <div className={styles.fields}>
        {employee ? field("grossMonthly", copy.gross, copy.grossHint, "35 000") : input.insured ? field("selfEmployedMonthlyBase", copy.base, copy.baseHint, "9 000") : null}
        {field("netMonthly", copy.net, copy.netHint, "30 000")}
      </div>
      {employee && <>
        <p className={styles.notice}>{copy.estimatedHint}</p>
        <details className={styles.details}>
          <summary>{copy.precision}</summary>
          <div className={styles.fields}>
            {field("hourlyEarnings", copy.hourly, copy.hourlyHint, "180")}
            {field("workingDays", copy.workingDays, copy.workingDaysHint, "10")}
            {field("hoursPerDay", copy.hours, copy.hoursHint, "8")}
          </div>
        </details>
      </>}
      <fieldset className={styles.fieldset}>
        <legend>{copy.period}</legend>
        <div className={styles.choices}>
          {SICKNESS_PERIODS.map(period => <button key={period} type="button" aria-pressed={input.period === period} onClick={() => update("period", period)}>{period} {copy.days}</button>)}
        </div>
      </fieldset>
      {errors.length > 0 && <p id="public-sickness-error" className={styles.error} role="alert">{copy.invalid}</p>}
      {!result && errors.length === 0 && <p className={styles.notice}>{copy.empty}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => setInput({ ...EMPTY_SICKNESS_ESTIMATE, employment: input.employment, insured: input.insured, grossMonthly: "35000", hourlyEarnings: "180", netMonthly: "30000", selfEmployedMonthlyBase: "9000", period: input.period })}>{copy.example}</button>
      </div>
      {result && <div className={styles.results} aria-live="polite" aria-atomic="true">
        <dl className={styles.twoColumns}>
          <div className={styles.payment}><dt>{copy.employer}</dt><dd data-sickness-result="employer">{money(result.employer)}</dd><dd className={styles.paymentNote}>{employee ? copy.employerNote : copy.noEmployer}</dd></div>
          <div className={styles.payment}><dt>{copy.state}</dt><dd data-sickness-result="state">{money(result.state)}</dd><dd className={styles.paymentNote}>{copy.stateNote}</dd></div>
        </dl>
        <div className={styles.total}><span>{copy.total} · {input.period} {copy.days}</span><strong data-sickness-result="total">{money(result.total)}</strong></div>
        <p className={styles.paragraph}>{copy.totalNote}</p>
        {result.normalIncome !== null && result.shortfall !== null ? <>
          <dl className={styles.comparison}>
            <div><dt>{copy.normalIncome}</dt><dd>{money(result.normalIncome)}</dd></div>
            <div className={styles.gap}><dt>{copy.gap}</dt><dd data-sickness-result="gap">{money(result.shortfall)}</dd></div>
          </dl>
          {result.shortfall === 0 && <p className={styles.hint}>{copy.noGap}</p>}
        </> : <p className={styles.notice}>{copy.addNet}</p>}
        {(employee || input.insured) && <details className={styles.details}>
          <summary>{copy.breakdown}</summary>
          <dl className={styles.breakdown}>
            {result.benefits.phases.slice(0, SICKNESS_PERIODS.indexOf(input.period) + 1).map((phase, index) => <div key={phase.rate}>
              <dt>{copy.periods[index]}<small>{phase.daily} {copy.daily} · {Math.round(phase.rate * 100)} % {copy.reduced}</small></dt><dd>{money(phase.total ?? 0)}</dd>
            </div>)}
          </dl>
        </details>}
      </div>}
      <p className={styles.paragraph}>{copy.assumptions}</p>
      <div className={styles.sources}>
        <span>{copy.sources}:</span>
        <a href="https://www.cssz.gov.cz/podrobne-informace-o-nemocenskem" target="_blank" rel="noreferrer noopener">ČSSZ</a>
        <a href="https://mpsv.gov.cz/kalkulacka-pro-vypocet-vyse-nahrady-mzdy-v-roce-2026" target="_blank" rel="noreferrer noopener">MPSV · 2026</a>
        <a href="https://www.cssz.gov.cz/nemocenske-pojisteni-davky" target="_blank" rel="noreferrer noopener">ČSSZ · OSVČ</a>
      </div>
      <p className={styles.paragraph}>{copy.privacy}</p>
    </section>
  );
}
