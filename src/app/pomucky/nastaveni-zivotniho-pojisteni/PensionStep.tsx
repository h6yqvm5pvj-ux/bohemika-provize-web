import { ArrowDownToLine, Calculator, ChartNoAxesColumn, Landmark } from "lucide-react";
import { PensionInputFields } from "../invalidni-duchod/PensionInputFields";
import { evaluatePensionForm, type PensionFormState } from "../invalidni-duchod/pensionForm";
import { formatPensionMoney, parsePensionNumber } from "../invalidni-duchod/pensionCalculation";
import { DISABILITY_PENSION_STATISTICS } from "@/lib/disabilityPensionStatistics";
import styles from "./pensionPlanning.module.css";

export function PensionStep({ enabled, onEnabledChange, form, onChange, age, employee, grossIncome }: {
  enabled: boolean; onEnabledChange: (value: boolean) => void;
  form: PensionFormState; onChange: (patch: Partial<PensionFormState>) => void;
  age: number; employee: boolean; grossIncome: string;
}) {
  const { result, incomeError, yearsError, minimumError } = evaluatePensionForm(form, age);
  const knownGross = parsePensionNumber(grossIncome);
  const amounts = enabled ? result?.pensions.map(item => item.total) : DISABILITY_PENSION_STATISTICS.degrees.map(item => item.averageMonthly);
  return <div className={styles.step}>
    <div className={styles.modeBar}>
      <div className={styles.choices} role="group" aria-label="Podklady pro invalidní důchod">
        <button type="button" aria-pressed={enabled} onClick={() => onEnabledChange(true)}><Calculator size={16} aria-hidden="true" />Osobní odhad</button>
        <button type="button" aria-pressed={!enabled} onClick={() => onEnabledChange(false)}><ChartNoAxesColumn size={16} aria-hidden="true" />Průměr v ČR</button>
      </div>
      <p>{enabled ? "Doplň příjem, započtenou dobu a vyber minimum." : "Orientační přehled bez zadávání údajů."}</p>
    </div>
    <div className={styles.workspace} data-personal={enabled}>
      {enabled && <div className={styles.form}>
        {!employee && <p className={styles.selfEmployedNote}>U OSVČ použij osobní vyměřovací základ (OVZ), nikoli obrat nebo zisk.</p>}
        <PensionInputFields form={form} update={onChange} clientAge={age} compact
          incomeAction={employee && knownGross !== null && form.incomeMode === "gross" && <button type="button" className={styles.takeIncome}
            onClick={() => onChange({ income: grossIncome, incomeMode: "gross" })}
            aria-label={`Převzít hrubý příjem z kroku Klient: ${formatPensionMoney(knownGross)}`}>
            <ArrowDownToLine size={13} aria-hidden="true" />Převzít {formatPensionMoney(knownGross)} z kroku Klient
          </button>} />
      </div>}
      <section className={styles.resultPanel} aria-label="Orientační státní důchod">
        <div className={styles.resultHeading}><Landmark size={18} aria-hidden="true" /><div><h3>{enabled ? "Osobní odhad důchodu" : "Průměrný důchod v ČR"}</h3><span>{enabled ? "Měsíčně · pravidla 2026" : "Měsíčně · statistika ČSSZ"}</span></div></div>
        <div className={styles.miniResults} aria-live="polite" aria-atomic="true">
          {["I.", "II.", "III."].map((degree, index) => <div key={degree}><span>{degree} stupeň</span><strong>{amounts ? formatPensionMoney(amounts[index]) : "—"}</strong></div>)}
        </div>
        <p className={styles.resultNote}>{enabled
          ? result ? "Orientační částky. Nárok a výši důchodu určuje ČSSZ." : incomeError || yearsError || minimumError ? "Uprav označené údaje a odhad se obnoví." : !form.minimumMode && form.income.trim() && form.years.trim() ? "Vyber možnost v poli Zvýšené minimum." : "Vyplň příjem a započtenou dobu a vyber minimum. Odhad se spočítá automaticky."
          : <>Statistické průměry k <time dateTime={DISABILITY_PENSION_STATISTICS.asOf}>31. 12. 2024</time>, nikoli osobní nárok. <a href={DISABILITY_PENSION_STATISTICS.sourceUrl} target="_blank" rel="noopener noreferrer">Zdroj ČSSZ</a>.</>}</p>
      </section>
    </div>
    <details className={styles.explanation}><summary>Jak číst tyto částky?</summary><p>Průměr ukazuje částky vyplácené v ČR. Osobní odhad vychází ze zadaného příjmu a započtené doby. Skutečný nárok a výši důchodu určuje ČSSZ.</p><p>Důchod slouží pro orientaci. Výši soukromého krytí pak zvolíš pomocí variant Nízká, Střední a Vysoká.</p></details>
  </div>;
}
