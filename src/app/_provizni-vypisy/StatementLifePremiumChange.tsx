"use client";

import { createContext, useContext, useState } from "react";
import { confirmedLifeStatementChange, matchesLifePremiumIncrease, type LifeStatementPremiumChange } from "@/app/lib/lifePremiumIncrease";
import { formatMoney } from "./statementParsing";
import type { MatchedSystemContract } from "./statementTypes";
import type { StatementCalculatorPrefillSource } from "./statementPresentation";

export type ConfirmLifePremiumChange = {
  contract: MatchedSystemContract; statementId: string; previousMonthlyPremium: number; newMonthlyPremium: number; effectiveDate: string;
};
export const StatementLifePremiumChangeContext = createContext<((input: ConfirmLifePremiumChange) => Promise<LifeStatementPremiumChange>) | null>(null);

export function StatementLifePremiumChange({ contract, annualIncrease, productCode, source }: {
  contract: MatchedSystemContract; annualIncrease: number; productCode: string; source?: StatementCalculatorPrefillSource;
}) {
  const confirm = useContext(StatementLifePremiumChangeContext);
  const [open, setOpen] = useState(false);
  const [previous, setPrevious] = useState(String(contract.newInputAmount ?? contract.effectiveInputAmount ?? contract.inputAmount ?? ""));
  const [next, setNext] = useState("");
  const [date, setDate] = useState("");
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = confirmedLifeStatementChange(contract.confirmedLifePremiumChanges, { ...source, productCode, annualIncrease });
  const endorsement = matchesLifePremiumIncrease(contract, annualIncrease);
  if (endorsement) return <p className="mt-3 text-sm text-emerald-800">Provize za navýšení je přiřazená k odpovídajícímu dodatku.</p>;
  if (change) return <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
    <strong>Změna pojistného potvrzena</strong>
    <p>{formatMoney(change.previousMonthlyPremium)} → {formatMoney(change.newMonthlyPremium)} Kč měsíčně, účinnost {change.effectiveDate.split("-").reverse().join(". ")}.</p>
    <p>Záznam je navázaný na zdrojový výpis.</p>
  </div>;
  const save = async () => {
    if (!confirm || !source?.statementId || saving) return;
    const oldAmount = Number(previous.replace(",", "."));
    const newAmount = Number(next.replace(",", "."));
    if (!verified || !date || !Number.isFinite(oldAmount) || oldAmount <= 0 || !Number.isFinite(newAmount) ||
      newAmount <= oldAmount || Math.abs((newAmount - oldAmount) * 12 - annualIncrease) > 0.01) {
      setError("Potvrď obě částky a účinnost. Rozdíl musí odpovídat základně navýšení z výpisu."); return;
    }
    setSaving(true); setError(null);
    try {
      await confirm({ contract, statementId: source.statementId, previousMonthlyPremium: oldAmount, newMonthlyPremium: newAmount, effectiveDate: date });
      setOpen(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Změnu se nepodařilo uložit."); }
    finally { setSaving(false); }
  };
  return <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <strong>Změna pojistného čeká na potvrzení</strong>
    <p>Výpis obsahuje provizi za navýšení. Pro ověření potřebujeme odpovídající dodatek nebo potvrzené pojistné a datum účinnosti.</p>
    {confirm && source?.statementId ? <>
      {!open && <button type="button" className="mt-2 rounded-lg border border-amber-400 px-3 py-2 font-semibold" onClick={() => setOpen(true)}>Potvrdit změnu pojistného</button>}
      {open && <form className="mt-3 space-y-3" aria-label="Potvrzení změny pojistného" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>Původní měsíční pojistné<input required type="number" min="0.01" step="0.01" className="mt-1 block w-full rounded-lg border bg-white p-2" value={previous} onChange={e => { setPrevious(e.target.value); setVerified(false); }} disabled={saving} /></label>
          <label>Nové měsíční pojistné<input required type="number" min="0.01" step="0.01" className="mt-1 block w-full rounded-lg border bg-white p-2" value={next} onChange={e => { setNext(e.target.value); setVerified(false); }} disabled={saving} /></label>
          <label>Účinnost změny<input required type="date" className="mt-1 block w-full rounded-lg border bg-white p-2" value={date} onChange={e => { setDate(e.target.value); setVerified(false); }} disabled={saving} /></label>
        </div>
        <label className="flex items-start gap-2"><input type="checkbox" required checked={verified} onChange={e => setVerified(e.target.checked)} disabled={saving} />Výši pojistného a datum účinnosti jsem ověřil(a).</label>
        <p>Uloží se záznam v historii pojistného. Původní výpočet provize zůstane zachovaný.</p>
        <button className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50" type="submit" disabled={saving || !verified}>{saving ? "Ukládám…" : "Uložit potvrzenou změnu"}</button>
        <button type="button" className="ml-3 font-semibold" disabled={saving} onClick={() => setOpen(false)}>Zrušit</button>
      </form>}
    </> : <p className="mt-2">Potvrzení bude dostupné po uložení výpisu.</p>}
    {error && <p role="alert" className="mt-2 text-rose-800">{error}</p>}
  </div>;
}
