"use client";

import { useId, useState } from "react";
import { ArrowRight, Calculator } from "lucide-react";
import { convertGoldAmount, goldMoney, parseGoldAmount } from "./goldModel";
import styles from "./gold.module.css";

export function GoldConverter({ pricePerOz, onShowProducts }: { pricePerOz: number | null; onShowProducts: () => void }) {
  const id = useId();
  const [mode, setMode] = useState<"grams" | "budget">("grams");
  const [amounts, setAmounts] = useState({ grams: "10", budget: "50000" });
  const amount = parseGoldAmount(amounts[mode]);
  const invalid = amounts[mode].trim() !== "" && amount == null;
  const result = convertGoldAmount(amount, pricePerOz, mode);

  return <section className={styles.converter} aria-labelledby={`${id}-title`}>
    <div className={styles.sectionHeading}>
      <h2 id={`${id}-title`} className="tool-card-title"><Calculator size={18} aria-hidden="true" />Rychlý přepočet</h2>
      <div className={styles.segmented} role="group" aria-label="Způsob přepočtu">
        <button type="button" aria-pressed={mode === "grams"} onClick={() => setMode("grams")}>Mám gramáž</button>
        <button type="button" aria-pressed={mode === "budget"} onClick={() => setMode("budget")}>Mám rozpočet</button>
      </div>
    </div>
    <div className={styles.converterBody}>
      <div className={styles.amountField}>
        <label htmlFor={id}>{mode === "grams" ? "Hmotnost zlata" : "Částka k přepočtu"}</label>
        <div className={styles.inputWrap}>
          <input id={id} inputMode="decimal" autoComplete="off" value={amounts[mode]} placeholder={mode === "grams" ? "Např. 10" : "Např. 50 000"}
            aria-invalid={invalid} aria-describedby={`${id}-note${invalid ? ` ${id}-error` : ""}`}
            onChange={e => setAmounts(prev => ({ ...prev, [mode]: e.target.value }))} />
          <span>{mode === "grams" ? "g" : "Kč"}</span>
        </div>
        {invalid && <p id={`${id}-error`} className={styles.inputError}>Zadej nezáporné číslo, například 10,5.</p>}
      </div>
      <ArrowRight className={styles.conversionArrow} size={22} aria-hidden="true" />
      <output className={styles.conversionResult} htmlFor={id} aria-live="polite">
        <span>{mode === "grams" ? "Orientační spotová hodnota" : "Odpovídající hmotnost za spotovou cenu"}</span>
        <strong>{result ? mode === "grams" ? goldMoney(result.czk) : `${result.grams.toLocaleString("cs-CZ", { maximumFractionDigits: 3 })} g` : "—"}</strong>
        {!pricePerOz && <small>Cena zlata zatím není k dispozici.</small>}
      </output>
      <button type="button" className={styles.secondaryButton} onClick={onShowProducts}>Ceny slitků<ArrowRight size={15} aria-hidden="true" /></button>
    </div>
    <p id={`${id}-note`} className={styles.note}>Přepočet podle zobrazené spotové ceny. Prodejní a výkupní ceny konkrétních slitků se liší.</p>
  </section>;
}
