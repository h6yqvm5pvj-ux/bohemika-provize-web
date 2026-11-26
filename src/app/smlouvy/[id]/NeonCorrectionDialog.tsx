"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PencilLine, X } from "lucide-react";
import { neonCorrectedAnnualBase } from "@/app/lib/neonCorrection";
import type { ContractDoc } from "./contractDetailTypes";
import { formatMoney } from "./contractDetailHelpers";
import styles from "./contractManagement.module.css";

export function NeonCorrectionDialog({ contract, onSave, onClose }: {
  contract: ContractDoc;
  onSave: (monthlyPremium: number, annualCorrection: number) => Promise<void>;
  onClose: () => void;
}) {
  const title = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthly, setMonthly] = useState(String(contract.inputAmount ?? ""));
  const [correction, setCorrection] = useState(String(contract.neonCorrection?.annualAmount ?? ""));
  const corrected = neonCorrectedAnnualBase(Number(monthly), Number(correction));

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    if (corrected === null) {
      setError("Zadej kladnou korekci nižší než roční pojistné.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave(Number(monthly), Number(correction));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ČPP korekci se nepodařilo uložit.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!saving.current) onClose(); }}>
    <header className={styles.header}>
      <span className={styles.headerIcon}><PencilLine size={23} aria-hidden="true" /></span>
      <div><p>ČPP NEON</p><h2 id={title}>{contract.neonCorrection ? "Upravit ČPP korekci" : "Přidat ČPP korekci"}</h2></div>
      <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Zavřít"><X size={19} /></button>
    </header>
    <form onSubmit={save} className={styles.form}>
      <div className={styles.content}>
        <label className={styles.field}><span>Skutečné měsíční pojistné při sjednání (Kč)</span>
          <input type="number" min="0.01" step="0.01" required disabled={busy} value={monthly}
            onChange={event => { setMonthly(event.target.value); setError(null); }} />
        </label>
        <label className={styles.field}><span>ČPP korekce (Kč za rok)</span>
          <input type="number" min="0.01" step="0.01" required disabled={busy} value={correction}
            onChange={event => { setCorrection(event.target.value); setError(null); }} />
        </label>
        <dl className={styles.summary} aria-live="polite">
          <div><dt>Základna výpisů do konce roku 2021</dt><dd>{corrected === null ? "—" : `${formatMoney(corrected)} / rok`}</dd></div>
          <div><dt>Plná základna výpisů od ledna 2022</dt><dd>{corrected === null ? "—" : `${formatMoney(Number(monthly) * 12)} / rok`}</dd></div>
        </dl>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.back} onClick={onClose} disabled={busy}>Zrušit</button>
        <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Ukládám…" : "Uložit korekci"}</button>
      </footer>
    </form>
  </dialog>;
}
