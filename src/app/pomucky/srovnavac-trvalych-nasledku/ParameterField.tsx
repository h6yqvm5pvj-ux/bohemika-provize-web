import { useId, useState } from "react";
import styles from "./comparison.module.css";

export function ParameterField({ label, value, onChange, min, max, step, unit, presets }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  presets: number[];
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  const safeValue = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min));
  const format = (amount: number) => amount.toLocaleString("cs-CZ");
  return (
    <div className={styles.parameter}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.numberField}>
        <input id={id} type="text" inputMode="decimal" value={focused ? value : format(safeValue)} onFocus={() => setFocused(true)} onChange={event => onChange(event.target.value)} onBlur={() => { onChange(String(safeValue)); setFocused(false); }} autoComplete="off" aria-describedby={`${id}-hint`} />
        <span>{unit}</span>
      </div>
      <input className={styles.slider} type="range" min={min} max={max} step={step} value={safeValue} onChange={event => onChange(event.target.value)} aria-label={`${label} – posuvník`} aria-valuetext={`${format(safeValue)} ${unit}`} />
      <div className={styles.scale} id={`${id}-hint`}><span>{format(min)} {unit}</span><span>{format(max)} {unit}</span></div>
      <div className={styles.presets} aria-label={`Rychlé hodnoty: ${label}`}>{presets.map(amount => <button key={amount} type="button" aria-pressed={safeValue === amount} onClick={() => onChange(String(amount))}>{format(amount)} {unit}</button>)}</div>
    </div>
  );
}
