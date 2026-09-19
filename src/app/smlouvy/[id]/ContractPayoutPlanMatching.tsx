"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Link2, RefreshCw, Unlink } from "lucide-react";
import type { PayoutPlanPreview } from "@/app/cashflow/payoutPlanMatching";
import { formatMoney } from "./contractDetailHelpers";
import styles from "./payoutPlanMatching.module.css";

export type PayoutPlanRequest = {
  operation: "preview" | "assign" | "remove";
  revision?: string;
  payoutKey?: string;
  targetKey?: string;
};
const monthLabel = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return year && number ? new Date(year, number - 1, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }) : month;
};
const dayLabel = (day: string) => day.split("-").reverse().join(".");

export function ContractPayoutPlanMatching({ onRequest }: {
  onRequest: (request: PayoutPlanRequest) => Promise<PayoutPlanPreview>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PayoutPlanPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (request: PayoutPlanRequest) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const next = await onRequest(request);
      setPreview(next); setChoices({});
      if (request.operation === "assign") setNotice("Přiřazeno. Cashflow použije skutečnou výplatu místo vybrané plánované provize.");
      if (request.operation === "remove") setNotice("Přiřazení zrušeno. Výplata zůstává ve výpisech a odhad se znovu zobrazí v plánu.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Přehled se nepodařilo načíst.");
    } finally { setBusy(false); }
  };
  const toggle = () => {
    setOpen(!open);
    if (!open && !preview && !busy) void run({ operation: "preview" });
  };
  return <section id="payout-plan-matching" className={styles.panel} aria-label="Přiřazení C výplat">
    <button type="button" className={styles.heading} aria-expanded={open} aria-controls={id} onClick={toggle}>
      <Link2 size={18} aria-hidden="true" />
      <span><strong>Přiřazení C výplat k cashflow</strong><small>Propoj výplatu s konkrétní následnou provizí v plánu.</small></span>
      <ChevronDown size={18} aria-hidden="true" className={open ? styles.expanded : ""} />
    </button>
    {open && <div id={id} className={styles.content} aria-busy={busy}>
      <div className={styles.intro}>
        <p>C kód může být následná provize. Její druh a přiřazení k období posuzujeme zvlášť. Vyber jen položku plánu, kterou výplata skutečně nahrazuje. Částky jsou před odpočtem stornofondu.</p>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => void run({ operation: "preview" })}><RefreshCw size={14} aria-hidden="true" />Obnovit</button>
      </div>
      {busy && <p role="status" className={styles.message}>Načítám…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      {preview?.payouts.map((payout, index) => {
        const selectedKey = choices[payout.key] ?? payout.targetKey ?? "";
        const selected = preview.targets.find(target => target.key === selectedKey);
        const active = preview.targets.find(target => target.key === payout.targetKey);
        const stale = Boolean(payout.savedTargetKey && !payout.targetKey);
        const targets = preview.targets.filter(target => !target.assignedPayoutKey || target.assignedPayoutKey === payout.key);
        const selectId = `${id}-${index}`;
        return <div className={styles.row} key={`${payout.key}-${index}`}>
          <div className={styles.source}>
            <div className={styles.sourceTitle}><strong>{payout.code}</strong><strong>{formatMoney(payout.amount)}</strong></div>
            {payout.meaning && <small title={payout.meaning.explanation}>{active ? "Následná provize" : payout.meaning.label}</small>}
            <small>Výplata {monthLabel(payout.month)}</small>
            {payout.statementPeriod && <small>Výpis za {payout.statementPeriod}</small>}
            <span className={active ? styles.matched : styles.pending}>{active ? <><Check size={13} aria-hidden="true" />Přiřazeno k {active.code}</> : payout.amount < 0 ? "Storno / srážka" : "Vyplaceno — nepřiřazeno k plánu"}</span>
          </div>
          <div className={styles.selection}>
            {payout.meaning?.kind === "subsequentCandidate" && !active && <p className={styles.message}>{payout.meaning.explanation}</p>}
            {payout.planNotice && !active && <p className={styles.notice}>{payout.planNotice}</p>}
            {stale && <p className={styles.error}>Původní vazba už neodpovídá výplatě nebo plánu. Zkontroluj ji a vyber znovu, případně ji zruš.</p>}
            {payout.blockReason ? <p className={styles.message}>{payout.blockReason}</p> : targets.length ? <>
              <label htmlFor={selectId}>Kterou plánovanou provizi tato výplata nahrazuje?</label>
              <select id={selectId} value={selectedKey} disabled={busy} onChange={event => setChoices(previous => ({ ...previous, [payout.key]: event.target.value }))}>
                <option value="">Kliknutím vyber období</option>
                {targets.map(target => <option key={target.key} value={target.key}>{target.code} · období od {dayLabel(target.periodStart)} · {formatMoney(target.amount)} · plán {monthLabel(target.month)}</option>)}
              </select>
              {selected && <p className={styles.message}>Plán {formatMoney(selected.amount)} pro období od {dayLabel(selected.periodStart)} nahradí výplata {formatMoney(payout.amount)} z měsíce {monthLabel(payout.month)}.</p>}
            </> : <p className={styles.message}>Není dostupná žádná nevyplacená následná provize. Výplata zůstává evidovaná samostatně.</p>}
            <div className={styles.actions}>
              {!payout.blockReason && targets.length > 0 && <button type="button" className={styles.primary} disabled={busy || !selected || selectedKey === payout.targetKey} onClick={() => void run({ operation: "assign", revision: preview.revision, payoutKey: payout.key, targetKey: selectedKey })}><Link2 size={14} aria-hidden="true" />Potvrdit přiřazení</button>}
              {payout.savedTargetKey && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void run({ operation: "remove", revision: preview.revision, payoutKey: payout.key })}><Unlink size={14} aria-hidden="true" />Zrušit vazbu</button>}
            </div>
          </div>
        </div>;
      })}
      {preview?.missingPayoutMatches.map(match => <div className={styles.intro} key={match.payoutKey}>
        <p>Výplata přiřazená k {match.plannedCode} ({monthLabel(match.plannedMonthKey)}) už v dostupných výpisech není. Vazba se nepoužívá.</p>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => void run({ operation: "remove", revision: preview.revision, payoutKey: match.payoutKey })}>Zrušit neplatnou vazbu</button>
      </div>)}
      {preview && !preview.payouts.length && !preview.missingPayoutMatches.length && <p className={styles.message}>Pro tvůj účet zde nejsou žádné C výplaty k přiřazení.</p>}
    </div>}
  </section>;
}
