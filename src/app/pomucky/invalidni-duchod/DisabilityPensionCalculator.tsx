"use client";

import { useState } from "react";
import { ArrowUpRight, Calculator, Check, Copy, Info, RotateCcw, Sparkles } from "lucide-react";
import { systemSansFont } from "@/lib/fonts";
import {
  buildPensionSummary, DISABILITY_DEGREES,
  formatPensionMoney as money, MINIMUM_LABELS,
} from "./pensionCalculation";
import styles from "./pension.module.css";
import { EMPTY_PENSION_FORM, evaluatePensionForm, type PensionFormState } from "./pensionForm";
import { PensionInputFields } from "./PensionInputFields";

const SOURCE_URL = "https://www.cssz.gov.cz/invalidni-duchody-podrobne";

export function DisabilityPensionCalculator() {
  const [form, setForm] = useState<PensionFormState>(EMPTY_PENSION_FORM);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const update = (patch: Partial<PensionFormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setCopyState("idle");
  };
  const { result, incomeError, yearsError, minimumError } = evaluatePensionForm(form);

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildPensionSummary(result, form.incomeMode));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
      <div className={`${styles.page} ${systemSansFont.className}`}>
        <header className={styles.hero}>
          <div>
            <div className={styles.eyebrow}><span className={styles.heroIcon}><Calculator size={18} aria-hidden="true" /></span> STÁTNÍ ZAJIŠTĚNÍ <span className={styles.yearBadge}>Pravidla 2026</span></div>
            <h1>Kalkulačka invalidního důchodu</h1>
            <p>Zjisti orientační měsíční důchod pro všechny tři stupně invalidity. Přehledně, s rozpisem výpočtu.</p>
          </div>
        </header>

        <div className={styles.workspace}>
          <section className={styles.formPanel} aria-labelledby="pension-inputs">
            <div className={styles.panelHeading}>
              <h2 id="pension-inputs">Údaje pro výpočet</h2>
              <button type="button" className={styles.iconButton} title="Vymazat údaje" aria-label="Vymazat údaje" onClick={() => update(EMPTY_PENSION_FORM)}><RotateCcw size={17} /></button>
            </div>
            <button type="button" className={styles.exampleButton} onClick={() => update({ income: "40000", years: "45", incomeMode: "gross", minimumMode: "insured15" })}><Sparkles size={15} aria-hidden="true" /> Vyplnit modelový příklad</button>

            <PensionInputFields form={form} update={update} />
          </section>

          <section className={styles.resultsPanel} aria-labelledby="pension-results">
            <div className={styles.resultsHeading}>
              <div><span className={styles.kicker}>SROVNÁNÍ STUPŇŮ</span><h2 id="pension-results">Orientační měsíční důchod</h2></div>
              <button type="button" className={styles.copyButton} disabled={!result} onClick={copyResult}>{copyState === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copyState === "copied" ? "Zkopírováno" : "Kopírovat výsledek"}</button>
            </div>
            <p className={styles.resultNote}>Nové přiznání v roce 2026 · částky předpokládají splnění nároku</p>
            <p className={styles.error} role="status">{copyState === "error" ? "Kopírování se nepodařilo. Výsledek můžeš označit a zkopírovat ručně." : ""}</p>

            <div className={styles.cards} aria-live="polite" aria-atomic="true">
              {DISABILITY_DEGREES.map((degree, index) => {
                const pension = result?.pensions[index];
                return (
                  <article key={degree.degree} className={styles.resultCard} data-degree={degree.degree} aria-labelledby={`pension-degree-${degree.degree}`}>
                    <div className={styles.cardHeading}><span className={styles.degreeIcon} aria-hidden="true">{[1, 2, 3].map((level) => <i key={level} data-filled={level <= degree.degree} />)}</span><h3 id={`pension-degree-${degree.degree}`}>{degree.roman} stupeň</h3></div>
                    <p className={styles.decline}>Pokles pracovní schopnosti<br /><strong>{degree.decline}</strong></p>
                    <div className={styles.amount} data-testid={`pension-total-${degree.degree}`}>{pension ? money(pension.total) : "—"}</div>
                    <span className={styles.monthly}>měsíčně</span>
                    <dl className={styles.cardBreakdown}>
                      <div><dt>Základní část</dt><dd>{pension ? money(pension.basicAmount) : "—"}</dd></div>
                      <div><dt>Procentní část</dt><dd>{pension ? money(pension.percentageAmount) : "—"}</dd></div>
                    </dl>
                    {pension?.minimumApplied && <p className={styles.minimumBadge}>Dorovnáno na {result?.minimumMode === "ordinary" ? "zákonné" : "zvýšené"} minimum</p>}
                  </article>
                );
              })}
            </div>

            {!result ? <div className={styles.emptyState}><Calculator size={24} aria-hidden="true" /><p>{incomeError || yearsError || minimumError ? "Uprav označené údaje a výpočet se obnoví." : !form.minimumMode && form.income.trim() && form.years.trim() ? "Vyber možnost v poli Zvýšené minimum." : "Vyplň příjem a započtenou dobu a vyber minimum. Výsledek se spočítá automaticky."}</p></div> : <>
              <div className={styles.calculationStrip}>
                <div><span>Započtená doba</span><strong>{result.creditedYears} celých let</strong></div>
                <div><span>Výpočtový základ po redukci</span><strong>{money(result.reducedBase)}</strong></div>
              </div>
              <details className={styles.breakdown}>
                <summary>Jak jsme částky spočítali</summary>
                <dl>
                  <div><dt>{form.incomeMode === "gross" ? "Odhad OVZ podle zadané mzdy" : "Zadaný OVZ"}</dt><dd>{money(result.assessmentBase)}</dd></div>
                  <div><dt>Do 21 546 Kč započítáváme 99 %</dt><dd>{money(result.firstBand)} × 99 %</dd></div>
                  <div><dt>Z části nad 21 546 do 195 868 Kč započítáváme 26 %</dt><dd>{money(result.secondBand)} × 26 %</dd></div>
                  {result.excluded > 0 && <div><dt>Část nad druhou hranicí se nezapočítává</dt><dd>{money(result.excluded)}</dd></div>}
                  <div><dt>Výpočtový základ po zaokrouhlení nahoru</dt><dd>{money(result.reducedBase)}</dd></div>
                </dl>
                <p>III. stupeň: výpočtový základ × {result.creditedYears} let × 1,495 %. II. stupeň má polovinu a I. stupeň třetinu takto určené procentní části. Částky se zaokrouhlují na celé koruny nahoru, uplatní se příslušné minimum a přičte základní část 4 900 Kč.</p>
                <p><strong>Režim minima:</strong> {MINIMUM_LABELS[result.minimumMode]}. {result.minimumMode !== "ordinary" && "Zvýšené minimum vychází ze 45 % redukovaného základu celostátní průměrné mzdy 48 967 Kč; u II. stupně z poloviny a u I. stupně ze třetiny této částky."}</p>
              </details>
            </>}
            <div className={styles.notice}><Info size={19} aria-hidden="true" /><p>{form.incomeMode === "gross" ? "Aktuální mzda je pouze odhad přepočtených celoživotních příjmů. " : "Výpočet závisí na správnosti zadaného OVZ a uznaných dob. "}Nárok a stupeň invalidity posuzuje ČSSZ. Samotné uznání invalidity ještě nezaručuje nárok na důchod.</p></div>
          </section>
        </div>

        <section className={styles.methodology} aria-labelledby="pension-methodology">
          <div><span className={styles.kicker}>DOBRÉ VĚDĚT</span><h2 id="pension-methodology">Co výpočet zahrnuje</h2><p>Pravidla ověřena k 17. 9. 2026</p></div>
          <div className={styles.methodologyContent}>
            <p>Pomůcka počítá nové české invalidní důchody pro rok 2026 z příjmů a celých započtených let. Rozhodující je splnění podmínek pojištění; dopočtená doba ovlivňuje výši, nenahrazuje potřebnou dobu pro vznik nároku.</p>
            <details>
              <summary>Kdy je potřeba individuální výpočet ČSSZ?</summary>
              <p>Pomůcka neřeší zahraniční doby a dílčí důchody, souběh více důchodů, účast v důchodovém spoření ve II. pilíři v letech 2013–2015, invaliditu z mládí, zvláštní krácení ani změnu stupně nebo valorizaci již přiznaného důchodu. Uvedená minima předpokládají plný český důchod.</p>
            </details>
            <div className={styles.sources}>
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">ČSSZ: invalidní důchody <ArrowUpRight size={14} aria-hidden="true" /></a>
              <a href="https://www.cssz.gov.cz/web/cz/uvod/-/asset_publisher/GQ48v1KeNe0J/content/id/3203431" target="_blank" rel="noopener noreferrer">Parametry pro rok 2026 <ArrowUpRight size={14} aria-hidden="true" /></a>
            </div>
          </div>
        </section>
      </div>
  );
}
