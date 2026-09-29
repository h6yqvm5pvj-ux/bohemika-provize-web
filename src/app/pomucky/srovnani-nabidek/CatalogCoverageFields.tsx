import { COVERAGE_STATUSES } from "./lifeCoverage";
import { AUTO_LIABILITY_LIMITS, DEDUCTIBLE_FIELDS, catalogDefinition, fieldIsVisible, liabilityLimitsLabel, type CatalogDetails } from "./coverageCatalog";
import { ChoiceField, ValueField } from "./LifeCoverageFields";
import styles from "./comparison.module.css";
import { MoneyInput } from "./MoneyInput";

export function CatalogCoverageFields({ value, context, onChange }: { value: CatalogDetails; context: string; onChange: (value: CatalogDetails) => void }) {
  const set = (id: string, next: string) => onChange({ ...value, values: { ...value.values, [id]: next } });
  return <div className={styles.smartFields} role="group" aria-label={`Parametry — ${context}`}>
    <ChoiceField label="Sjednání" context={context} value={value.status} options={COVERAGE_STATUSES} onChange={status => onChange({ ...value, status: status as CatalogDetails["status"] })} />
    {value.status === "excluded" ? <p className={styles.smartHint}>V této smlouvě není sjednáno.</p> : catalogDefinition(value.kind).fields.filter(field => fieldIsVisible(field, value.values)).map(field => {
      if (field.id === "deductibleType") return <DeductibleField key={field.id} value={value} context={context} onChange={onChange} />;
      if (DEDUCTIBLE_FIELDS.some(item => item.id === field.id)) return null;
      if (value.kind === "auto-liability" && field.id === "propertyLimit") return null;
      if (value.kind === "auto-liability" && field.id === "healthLimit") return <LiabilityLimitsField key={field.id} value={value} context={context} onChange={onChange} />;
      const selected = value.values[field.id] || "";
      if (field.multiple && field.options) return <fieldset key={field.id} className={styles.riskChoices}>
        <legend>{field.label}</legend>
        {field.options.map(option => <label key={option.id}><input type="checkbox" aria-label={`${option.label} — ${context}`} checked={selected.split("|").includes(option.id)} onChange={event => {
          const choices = new Set(selected.split("|").filter(Boolean));
          if (event.target.checked) choices.add(option.id); else choices.delete(option.id);
          set(field.id, field.options!.filter(option => choices.has(option.id)).map(option => option.id).join("|"));
        }} />{option.label}</label>)}
      </fieldset>;
      if (field.options) return <ChoiceField key={field.id} label={field.label} context={context} value={selected} options={field.options} onChange={next => set(field.id, next)} />;
      return <ValueField key={field.id} label={`${field.label}${field.unit ? ` (${field.unit})` : ""}`} context={context} value={selected} numeric={Boolean(field.unit)} unit={field.unit} placeholder={field.placeholder} onChange={next => set(field.id, next)} />;
    })}
  </div>;
}

function DeductibleField({ value, context, onChange }: { value: CatalogDetails; context: string; onChange: (value: CatalogDetails) => void }) {
  const type = value.values.deductibleType;
  const set = (id: string, next: string) => onChange({ ...value, values: { ...value.values, [id]: next } });
  const options = DEDUCTIBLE_FIELDS[0].options!;
  const shortLabels: Record<string, string> = { none: "Bez spoluúčasti", fixed: "Pevná", percent: "%", "percent-min": "%/min.", custom: "Vlastní" };
  const input = (id: string, label: string, placeholder: string, numeric = true) => numeric && id !== "deductiblePercent" ? <MoneyInput
    aria-label={`${label} — ${context}`} value={value.values[id]} maxLength={160} placeholder={placeholder}
    className={styles.deductibleAmount} showUnit={false} onChange={next => set(id, next)}
  /> : <input
    aria-label={`${label} — ${context}`} value={value.values[id]} maxLength={160}
    inputMode={numeric ? "decimal" : "text"} placeholder={placeholder}
    className={id === "deductiblePercent" ? styles.deductiblePercent : numeric ? styles.deductibleAmount : styles.deductibleCustom}
    onChange={event => set(id, event.target.value)}
  />;
  return <fieldset className={styles.deductibleField}>
    <legend>Spoluúčast</legend>
    <div className={styles.deductibleControls} data-empty={!type || type === "none"}>
      <select aria-label={`Spoluúčast — ${context}`} value={type} title={options.find(option => option.id === type)?.label || "Typ spoluúčasti"} onChange={event => set("deductibleType", event.target.value)}>
        <option value="">Vybrat…</option>
        {options.map(option => <option key={option.id} value={option.id} aria-label={option.label}>{shortLabels[option.id]}</option>)}
      </select>
      {type === "fixed" && <>{input("deductibleFixed", "Pevná spoluúčast (Kč)", "5 000")}<span>Kč</span></>}
      {(type === "percent" || type === "percent-min") && <>{input("deductiblePercent", "Procentní spoluúčast (%)", "5")}<span>%{type === "percent-min" ? "," : ""}</span></>}
      {type === "percent-min" && <><span>min.</span>{input("deductibleMin", "Minimální spoluúčast (Kč)", "5 000")}<span>Kč</span></>}
      {type === "custom" && input("deductibleCustom", "Vlastní spoluúčast", "Podle smlouvy", false)}
    </div>
  </fieldset>;
}

function LiabilityLimitsField({ value, context, onChange }: { value: CatalogDetails; context: string; onChange: (value: CatalogDetails) => void }) {
  // Retain the two stored values so existing drafts, including unequal limits,
  // remain readable while the editor shows one combined picker.
  const selected = AUTO_LIABILITY_LIMITS.find(option => option.id === value.values.healthLimit.trim() && option.id === value.values.propertyLimit.trim());
  const savedLabel = liabilityLimitsLabel(value.values);
  const options = !selected && savedLabel ? [...AUTO_LIABILITY_LIMITS, { id: "saved", label: savedLabel }] : AUTO_LIABILITY_LIMITS;
  return <ChoiceField label="Limity odpovědnosti" context={context} value={selected?.id || (savedLabel ? "saved" : "")} options={options} onChange={next => {
    if (next === "saved") return;
    onChange({ ...value, values: { ...value.values, healthLimit: next, propertyLimit: next } });
  }} />;
}
