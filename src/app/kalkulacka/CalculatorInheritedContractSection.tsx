"use client";

import { UserRoundCheck } from "lucide-react";
import type { CommissionMode, Position } from "@/app/types/domain";
import { positionLabel } from "@/app/lib/formatters";
import { POSITION_ORDER } from "./calculatorHelpers";
import styles from "./calculatorForm.module.css";

type Props = {
  originalPosition: Position | "";
  originalAdviserName: string;
  effectiveDate: string;
  canChooseMode: boolean;
  mode: CommissionMode;
  onModeChange: (value: CommissionMode) => void;
  onPositionChange: (value: Position | "") => void;
  onNameChange: (value: string) => void;
  onDateChange: (value: string) => void;
};

export function CalculatorInheritedContractSection({ originalPosition, originalAdviserName, effectiveDate, canChooseMode, mode, onModeChange, onPositionChange, onNameChange, onDateChange }: Props) {
  const fieldClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";
  return (
    <section className={`${styles.card} ${styles.fields}`}>
      <h2 className={styles.sectionHeading}>
        <span className={styles.sectionIcon}><UserRoundCheck size={18} strokeWidth={1.7} aria-hidden="true" /></span>
        Převzetí smlouvy
      </h2>
      <p className="mb-4 text-sm leading-6 text-slate-600">
        Zadávej původní datum sjednání a počátku smlouvy. Následné provize se počítají z původní pozice, od data převzetí. Pořizovací provize se nezapočítají.
      </p>
      <div className={styles.fieldGrid}>
        <div>
          <label htmlFor="inherited-position" className={labelClass}>Pozice při původním sjednání *</label>
          <select id="inherited-position" required value={originalPosition} className={fieldClass} onChange={(event) => onPositionChange(event.target.value as Position | "")}>
            <option value="">Vyber původní pozici</option>
            {POSITION_ORDER.map((position) => <option key={position} value={position}>{positionLabel(position)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="inherited-date" className={labelClass}>Datum převzetí *</label>
          <input id="inherited-date" type="date" required value={effectiveDate} className={fieldClass} onChange={(event) => onDateChange(event.target.value)} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="inherited-adviser" className={labelClass}>Původní sjednatel <span className="font-normal text-slate-400">(nepovinné)</span></label>
          <input id="inherited-adviser" type="text" maxLength={200} value={originalAdviserName} placeholder="Jméno a příjmení" className={fieldClass} onChange={(event) => onNameChange(event.target.value)} />
        </div>
        {canChooseMode && (
          <div>
            <label htmlFor="inherited-mode" className={labelClass}>Původní režim provize</label>
            <select id="inherited-mode" value={mode} className={fieldClass} onChange={(event) => onModeChange(event.target.value as CommissionMode)}>
              <option value="standard">Běžná</option>
              <option value="accelerated">Zrychlená</option>
            </select>
          </div>
        )}
      </div>
    </section>
  );
}
