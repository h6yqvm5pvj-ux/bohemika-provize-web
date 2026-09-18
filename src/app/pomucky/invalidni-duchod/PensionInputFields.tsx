"use client";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { evaluatePensionForm, type PensionFormState } from "./pensionForm";
import styles from "./pension.module.css";
import { PensionMinimumAgeHint, PensionMinimumHelp } from "./PensionMinimumHelp";
import { PensionMinimumPicker } from "./PensionMinimumPicker";

export function PensionInputFields({ form, update, clientAge, compact = false, incomeAction }: {
  form: PensionFormState; update: (patch: Partial<PensionFormState>) => void; clientAge?: number;
  compact?: boolean; incomeAction?: ReactNode;
}) {
  const { incomeError, yearsError, minimumError } = evaluatePensionForm(form, clientAge);
  return <div className={`${styles.inputFields} ${compact ? styles.compactFields : ""}`}>
              <div className={`${styles.segmented} ${styles.incomeMode}`} role="group" aria-label="Způsob zadání příjmu">
                <button type="button" aria-pressed={form.incomeMode === "gross"} onClick={() => update({ incomeMode: "gross" })}>Odhad ze mzdy</button>
                <button type="button" aria-pressed={form.incomeMode === "assessment"} onClick={() => update({ incomeMode: "assessment" })}>Znám svůj OVZ</button>
              </div>
            <div className={styles.field}>
              <label htmlFor="pension-income">{form.incomeMode === "gross" ? "Hrubý měsíční příjem" : "Osobní vyměřovací základ (OVZ)"}</label>
              <div className={styles.inputWrap}>
                <input id="pension-income" inputMode="decimal" autoComplete="off" placeholder="např. 40 000" value={form.income} onChange={(event) => update({ income: event.target.value })} aria-invalid={Boolean(incomeError)} aria-describedby="pension-income-help pension-income-error" />
                <span>Kč / měsíc</span>
              </div>
              <p id="pension-income-help" className={styles.help}>{compact
                ? form.incomeMode === "gross" ? "Mzda je orientační odhad celoživotního průměru." : "OVZ z podkladů ČSSZ před redukcí. Nejde o obrat ani zisk."
                : form.incomeMode === "gross"
                ? "Mzda slouží jako odhad průměru celoživotních příjmů přepočtených na dnešní úroveň. U OSVČ použij OVZ, nikoli obrat nebo zisk."
                : "Průměr měsíčních vyměřovacích základů za rozhodné období po přepočtu. Nezadávej již redukovaný výpočtový základ."}</p>
              <p id="pension-income-error" className={styles.error}>{incomeError}</p>
              {incomeAction}
            </div>

            <div className={styles.field}>
              <label htmlFor="pension-years">Celková započtená doba</label>
              <div className={styles.inputWrap}>
                <input id="pension-years" inputMode="numeric" autoComplete="off" placeholder="např. 45" value={form.years} onChange={(event) => update({ years: event.target.value })} aria-invalid={Boolean(yearsError)} aria-describedby="pension-years-help pension-years-error" />
                <span>celých let</span>
              </div>
              <p id="pension-years-help" className={styles.help}>{compact ? "Včetně uznané doby do důchodu, nejen odpracované roky." : "Včetně uznané dopočtené doby do důchodového věku. Samotné dosud odpracované roky nestačí."}</p>
              <p id="pension-years-error" className={styles.error}>{yearsError}</p>
              <details className={styles.inlineHelp}>
                <summary>Jak určit započtenou dobu?</summary>
                <p>Sečti uznané dny pojištění, započitatelné náhradní doby a dopočtenou dobu. Součet vyděl 365 a vezmi celé roky. Například 25 let uznané doby a 20 let plně započtené budoucí doby dává 45 let.</p>
                <p>Dopočtená doba vede od vzniku nároku do důchodového věku ženy stejného data narození bez dětí, i u mužů. Při mezerách v pojištění se může krátit; u náhradních dob se může započítat jen část.</p>
                <a href="https://eportal.cssz.cz/web/portal/-/sluzby/moje-konto" target="_blank" rel="noopener noreferrer">Zkontrolovat evidenci na ČSSZ <ArrowUpRight size={13} aria-hidden="true" /></a>
              </details>
            </div>

            <div className={`${styles.field} ${styles.minimumField}`}>
              <div className={styles.minimumLabelRow}>
                <label id="pension-minimum-label" htmlFor="pension-minimum">Zvýšené minimum</label>
                <PensionMinimumHelp clientAge={clientAge} />
              </div>
              <PensionMinimumPicker value={form.minimumMode} onChange={minimumMode => update({ minimumMode })}
                clientAge={clientAge} invalid={Boolean(minimumError)}
                describedBy={`pension-minimum-help pension-minimum-error${clientAge !== undefined ? " pension-minimum-age" : ""}`} />
              <p id="pension-minimum-help" className={styles.help}>{!form.minimumMode ? "Vyber běžné nebo zvýšené minimum. Podmínky najdeš v nápovědě." : compact
                ? form.minimumMode === "ordinary" ? "Běžné zákonné minimum je zahrnuté automaticky."
                  : form.minimumMode === "insured15" ? "Alespoň 15 let získaného pojištění bez náhradních a budoucích dob."
                    : "Jen při splněném nároku a nepokrytých dobách od 18 let kratších než rok. Výjimku před 18 lety vysvětluje Nápověda."
                : form.minimumMode === "ordinary"
                ? "Běžné zákonné minimum zahrnujeme vždy. Vyšší minimum lze použít při 15 letech pojištění bez náhradních dob nebo u některých osob mladších 28 let."
                : form.minimumMode === "insured15"
                  ? "Ke dni vzniku nároku je získáno alespoň 15 let pojištění bez náhradních dob. Budoucí dopočtená doba se do těchto 15 let nepočítá."
                  : "Samotný věk nestačí. Musí vzniknout nárok na invalidní důchod a součet nepokrytých dob od 18 let musí být kratší než rok. Zvláštní pravidlo platí při přiznání před 18. narozeninami; podrobnosti najdeš v nápovědě."}</p>
              <p id="pension-minimum-error" className={styles.error} role={minimumError ? "alert" : undefined}>{minimumError}</p>
              <PensionMinimumAgeHint clientAge={clientAge} id="pension-minimum-age" compact={compact} />
              {form.minimumMode === "under28" && clientAge !== undefined && clientAge >= 28 && <button type="button" className={styles.minimumResetButton} onClick={() => update({ minimumMode: "ordinary" })}>Použít běžné minimum</button>}
            </div>
  </div>;
}
