"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { autoAnnualPremiumAtDate, contractPaymentFrequencies, paymentFrequencyAtDate } from "@/app/lib/autoPaymentFrequency";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { installmentPaymentsPerYear } from "@/app/lib/productFormulas/autoCommission";
import type { PaymentFrequency } from "@/app/types/domain";
import type { ContractDoc } from "./contractDetailTypes";
import { frequencyText, formatDate } from "./contractDetailHelpers";
import styles from "./contractManagement.module.css";

const MAX_ANNUAL_PREMIUM_CENTS = 100_000_000_000;

export function ContractFrequencyChangeDialog({ contract, onSave, onClose, includePremium = false, committed = false }: {
  contract: ContractDoc;
  includePremium?: boolean;
  committed?: boolean;
  onSave: (frequency: PaymentFrequency, effectiveDate: string, annualPremium?: number, file?: File) => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enteredPremium, setEnteredPremium] = useState<string | null>(null);
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  function selectFile(candidate?: File) {
    if (!candidate) return;
    if (!/\.pdf$/i.test(candidate.name) || !["", "application/pdf", "application/x-pdf"].includes(candidate.type.toLowerCase()) || candidate.size <= 0 || candidate.size > 12 * 1024 * 1024) {
      setError("Vyber PDF o velikosti nejvýše 12 MB."); return;
    }
    setFile(candidate); setError(null);
  }
  const [day, setDay] = useState("");
  const allowed = contractPaymentFrequencies(contract.productKey);
  const changes = contract.paymentFrequencyChanges ?? [];
  const minimum = changes.at(-1)?.effectiveDate ?? endorsementCommissionDay(contract.policyStartDate) ?? "1900-01-01";
  const [frequency, setFrequency] = useState<PaymentFrequency>(() => {
    const current = paymentFrequencyAtDate(contract, minimum);
    return current && allowed.includes(current) ? current : allowed[0];
  });
  const paymentsPerYear = installmentPaymentsPerYear(frequency);
  const maxPaymentCents = Math.floor(MAX_ANNUAL_PREMIUM_CENTS / paymentsPerYear);
  const previousAnnualCents = includePremium ? Math.round((autoAnnualPremiumAtDate(contract, "2199-12-31") ?? 0) * 100) : 0;
  const defaultPaymentCents = previousAnnualCents / paymentsPerYear;
  const paymentPremium = enteredPremium ?? (Number.isInteger(defaultPaymentCents) && defaultPaymentCents > 0 && defaultPaymentCents <= maxPaymentCents
    ? String(defaultPaymentCents / 100) : "");
  const paymentAmount = Number(paymentPremium);
  const paymentCents = Math.round(paymentAmount * 100);
  const annualPremium = paymentAmount === paymentCents / 100 && paymentCents > 0 && paymentCents <= maxPaymentCents
    ? paymentCents * paymentsPerYear / 100 : undefined;

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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!day || day <= minimum || endorsementCommissionDay(day) !== day || !allowed.includes(frequency)) {
      setError("Vyber platné datum po počátku smlouvy a po poslední uložené změně."); return;
    }
    if (!includePremium && paymentFrequencyAtDate(contract, day) === frequency) {
      setError("Vyber jinou frekvenci než dosud platnou."); return;
    }
    if (includePremium && annualPremium === undefined) {
      setError("Zadej platné frekvenční pojistné v Kč, nejvýše na dvě desetinná místa."); return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try { if (includePremium) await onSave(frequency, day, annualPremium, file); else await onSave(frequency, day); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Změnu se nepodařilo uložit."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); if (!lock.current) onClose(); }}>
    <header className={styles.header}>
      <span className={styles.headerIcon}><CalendarDays size={23} aria-hidden="true" /></span>
      <div><p>Smlouva {contract.contractNumber}</p><h2 id={`${id}-title`}>{includePremium ? "Změna na smlouvě" : "Změna frekvence placení"}</h2></div>
      <button type="button" className={styles.close} disabled={busy} onClick={onClose} aria-label="Zavřít změnu frekvence"><X size={19} /></button>
    </header>
    <form onSubmit={save} className={styles.form}>
      <div className={styles.content}>
        <div className={styles.notice}><p>{includePremium ? `Vytvoří se dodatek s přehledem změny. Od účinnosti se přepočítají očekávané ${contract.productKey === "domex" ? "provize z plateb" : "následné provize"} podle nového pojistného a frekvence. Zapsané výplaty zůstanou zachované.` : "Původní frekvence při sjednání zůstane zachovaná. Od data účinnosti se změní četnost a přepočítá částka jednotlivých očekávaných provizí. Základna ani zapsané výplaty se nemění."}</p></div>
        {committed && <p role="status">Změna už je uložená. Zbývá dokončit přílohu nebo obnovit detail.</p>}
        {includePremium && <p className="mb-3 font-semibold">{contract.clientName}</p>}
        <dl className={styles.summary}>
          <div><dt>Při sjednání</dt><dd>{frequencyText(contract.frequencyRaw ?? null)} · {formatDate(contract.policyStartDate)}</dd></div>
          {changes.map(change => <div key={change.effectiveDate}><dt>Od {formatDate(change.effectiveDate)}</dt><dd>{frequencyText(change.frequency)}{change.annualPremium != null ? ` · ${change.annualPremium.toLocaleString("cs-CZ")} Kč / rok` : ""}</dd></div>)}
        </dl>
        <label className={styles.field}><span>Nová frekvence placení</span>
          <select className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900" value={frequency} disabled={busy || committed}
            onChange={event => { setFrequency(event.target.value as PaymentFrequency); setError(null); }}>
            {allowed.map(value => <option value={value} key={value}>{frequencyText(value)}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>Datum účinnosti změny</span>
          <input type="date" required min={minimum} max="2199-12-31" value={day} disabled={busy || committed}
            onChange={event => { setDay(event.target.value); setError(null); }} />
        </label>
        {includePremium && <>
          <label className={styles.field}><span>Nové frekvenční pojistné (Kč)</span>
            <input type="number" min="0.01" max={maxPaymentCents / 100} step="0.01" required value={paymentPremium}
              aria-describedby={`${id}-premium-hint`} disabled={busy || committed}
              onChange={event => { setEnteredPremium(event.target.value); setError(null); }} />
          </label>
          <p id={`${id}-premium-hint`} className="mb-3 text-sm">
            Částka za jednu platbu podle zvolené frekvence.
            {annualPremium !== undefined && ` Roční pojistné vychází na ${annualPremium.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč.`}
          </p>
          <div className={`rounded-xl border-2 border-dashed p-4 ${dragging ? "border-violet-500 bg-violet-50" : "border-violet-200"}`}
            onDragOver={event => {
              event.preventDefault();
              if (busy || !event.dataTransfer.types.includes("Files")) return;
              event.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={event => { if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDragging(false); }}
            onDrop={event => {
              event.preventDefault();
              setDragging(false);
              if (busy) return;
              if (event.dataTransfer.files.length !== 1) { setError("Vlož právě jedno PDF."); return; }
              if (fileInput.current) fileInput.current.value = "";
              selectFile(event.dataTransfer.files[0]);
            }}>
            <label className={styles.field}><span>PDF dodatku (volitelné) – přetáhni sem nebo vyber</span><input ref={fileInput} type="file" accept=".pdf,application/pdf" disabled={busy}
              onChange={event => { selectFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
            {file && <p className="break-all text-sm">{file.name} <button type="button" disabled={busy} onClick={() => { setFile(undefined); setError(null); }}>Odebrat</button></p>}
            <p className="text-xs">Nejvýše 12 MB. Server zkontroluje formát, skripty a vložené soubory.</p>
          </div>
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.back} disabled={busy} onClick={onClose}>{committed ? "Dokončit bez přílohy" : "Zrušit"}</button>
        <button type="submit" className={styles.primary} disabled={busy || !day}>{busy ? "Ukládám…" : committed ? "Dokončit uložení" : "Uložit změnu"}</button>
      </footer>
    </form>
  </dialog>;
}
