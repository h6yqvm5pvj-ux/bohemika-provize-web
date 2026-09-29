import {
  AMOUNT_TYPES, COVERAGE_STATUSES, DEGREE_LABELS, DISABILITY_DEGREES, INJURY_THRESHOLDS, PROGRESSIONS,
  type LifeDetails,
} from "./lifeCoverage";
import styles from "./comparison.module.css";
import { MoneyInput } from "./MoneyInput";

type Choice = { id: string; label: string };
export function ChoiceField({ label, context, value, options, onChange, placeholder = "Vybrat…" }: {
  label: string; context: string; value: string; options: readonly Choice[]; onChange: (value: string) => void; placeholder?: string;
}) {
  return <label>{label}<select aria-label={`${label} — ${context}`} value={value} onChange={event => onChange(event.target.value)}>
    {!options.some(option => option.id === "") && <option value="">{placeholder}</option>}
    {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select></label>;
}
export function ValueField({ label, context, value, onChange, placeholder = "Např. 1 000 000", numeric = true, unit }: {
  label: string; context: string; value: string; onChange: (value: string) => void; placeholder?: string; numeric?: boolean; unit?: string;
}) {
  const currency = unit ?? label.match(/\((Kč(?:\/[^)]+)?)\)$/)?.[1];
  if (currency?.startsWith("Kč")) return <label>{label}<MoneyInput aria-label={`${label} — ${context}`} value={value} maxLength={160} placeholder={placeholder} unit={currency} onChange={onChange} /></label>;
  return <label>{label}<input aria-label={`${label} — ${context}`} inputMode={numeric ? "decimal" : "text"} value={value} maxLength={160} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>;
}

export function LifeCoverageFields({ value, context, onChange }: { value: LifeDetails; context: string; onChange: (value: LifeDetails) => void }) {
  return <div className={styles.smartFields} role="group" aria-label={`Parametry — ${context}`}>
    <ChoiceField label="Sjednání" context={context} value={value.status} options={COVERAGE_STATUSES} onChange={status => onChange({ ...value, status: status as LifeDetails["status"] })} />
    {value.status === "excluded" ? <p className={styles.smartHint}>V této smlouvě není sjednáno.</p> : <>
      {value.kind === "investment" && <ValueField label="Měsíční investice (Kč)" context={context} value={value.monthlyAmount} placeholder="Např. 500" onChange={monthlyAmount => onChange({ ...value, monthlyAmount })} />}
      {"amount" in value && <ValueField label="Pojistná částka (Kč)" context={context} value={value.amount} onChange={amount => onChange({ ...value, amount })} />}
      {"amountType" in value && <>
        <ChoiceField label="Průběh pojistné částky" context={context} value={value.amountType} options={AMOUNT_TYPES} onChange={amountType => onChange({ ...value, amountType: amountType as typeof value.amountType })} />
        {value.amountType === "loan" && <ValueField label="Úrok z úvěru (%)" context={context} value={value.interestRate} placeholder="Např. 4,5" onChange={interestRate => onChange({ ...value, interestRate })} />}
      </>}
      {value.kind === "disability" && <>
        <ChoiceField label="Stupně invalidity" context={context} value={value.degrees} options={DISABILITY_DEGREES} onChange={degrees => onChange({ ...value, degrees: degrees as typeof value.degrees })} />
        {value.degrees ? <fieldset className={styles.degreeAmounts}>
          <legend>Invalidita · {DISABILITY_DEGREES.find(option => option.id === value.degrees)!.label}</legend>
          {DISABILITY_DEGREES.find(option => option.id === value.degrees)!.degrees.map(degree => <ValueField key={degree} label={`${DEGREE_LABELS[degree]} (Kč)`} context={context} value={value.amounts[degree]} onChange={amount => onChange({ ...value, amounts: { ...value.amounts, [degree]: amount } })} />)}
        </fieldset> : <p className={styles.smartHint}>Vyber stupně a doplň částku pro každý z nich.</p>}
        <p className={styles.smartHint}>Jedno společné riziko s rozpisem částek pro zvolené stupně.</p>
      </>}
      {value.kind === "injury" && <>
        <ChoiceField label="Progrese" context={context} value={value.progression} options={[...PROGRESSIONS, { id: "custom", label: "Vlastní progrese" }]} onChange={progression => onChange({ ...value, progression: progression as typeof value.progression })} />
        {value.progression === "custom" && <ValueField label="Vlastní progrese" context={context} value={value.customProgression} placeholder="Doplň variantu podle smlouvy" numeric={false} onChange={customProgression => onChange({ ...value, customProgression })} />}
        <ChoiceField label="Plnění od" context={context} value={value.threshold} options={[...INJURY_THRESHOLDS, { id: "custom", label: "Jiná hranice" }]} onChange={threshold => onChange({ ...value, threshold: threshold as typeof value.threshold })} />
        {value.threshold === "custom" && <ValueField label="Vlastní hranice (%)" context={context} value={value.customThreshold} placeholder="Např. 1" onChange={customThreshold => onChange({ ...value, customThreshold })} />}
      </>}
    </>}
  </div>;
}
