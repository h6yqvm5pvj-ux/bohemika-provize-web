import type { SicknessInputs } from "./sicknessBenefits";
import styles from "./lifeInsuranceSetup.module.css";

export function SicknessBenefitInputs({ values, employee, insured, onChange }: {
  values: SicknessInputs; employee: boolean; insured: boolean;
  onChange: (values: SicknessInputs) => void;
}) {
  if (!insured) return null;
  const field = (key: keyof SicknessInputs, label: string, note: string, placeholder: string) => <label className={styles.benefitInput} key={key}>
    {label}<input id={`sickness-${key}`} type="text" inputMode="decimal" value={values[key]} placeholder={placeholder}
      aria-describedby={`sickness-${key}-note`} onChange={event => onChange({ ...values, [key]: event.target.value })} />
    <small id={`sickness-${key}-note`}>{note}</small>
  </label>;
  return <section className={styles.benefitInputs} aria-label="Podklady pro nemocenskou">
    <div><h3>Kolik klient dostane při neschopnosti?</h3><p>Nepovinné podklady pro rozpis náhrady mzdy a nemocenské v roce 2026. Bez nich příslušnou částku nevyčíslíme.</p></div>
    <div className={styles.benefitInputGrid}>
      {employee ? <>
        {field("grossMonthly", "Průměrný hrubý příjem měsíčně", "Započitatelné příjmy za posledních 12 měsíců, v Kč.", "Např. 50 000")}
        {field("hourlyEarnings", "Průměrný hodinový výdělek", "PHV z mzdové účtárny za předchozí čtvrtletí, včetně případného dorovnání na zákonné minimum. V Kč/h.", "Např. 300")}
      </> : field("selfEmployedMonthlyBase", "Měsíční základ nemocenského pojištění", "Průměr základů pro dobrovolné nemocenské pojištění OSVČ. Nejde o zisk ani o výši pojistného.", "Např. 9 000")}
    </div>
    {employee && <details><summary>Pracovní doba v prvních 14 dnech</summary><p>Výchozí model: 10 pracovních dnů po 8 hodinách. U směn nebo kratšího úvazku uprav skutečný rozvrh. Zahrň i svátky, za které náleží náhrada.</p><div className={styles.benefitInputGrid}>
      {field("workingDays", "Placené pracovní dny", "V prvních 14 kalendářních dnech, rozsah 0–14.", "10")}
      {field("hoursPerDay", "Hodin za pracovní den", "Při různě dlouhých směnách použij průměr, nejvýše 24 h.", "8")}
    </div></details>}
  </section>;
}
