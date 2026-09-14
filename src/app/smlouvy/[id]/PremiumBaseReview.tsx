"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PremiumBasePeriod, PremiumBaseSource, resolveAutoPremiumBasis } from "@/app/lib/autoPremiumBasis";
import { formatMoney } from "./contractDetailHelpers";

export type PremiumBaseReviewItem = { source: PremiumBaseSource; basis: ReturnType<typeof resolveAutoPremiumBasis> };
export type ResolvePremiumBase = (source: PremiumBaseSource, period: PremiumBasePeriod) => Promise<void>;

export function PremiumBaseReview({ items, onResolve, onOpenStatement }: {
  items: PremiumBaseReviewItem[];
  onResolve?: ResolvePremiumBase;
  onOpenStatement?: (id: string) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!items.length) return null;
  const pending = items.some(item => item.basis.status !== "resolved");
  const save = async (item: PremiumBaseReviewItem, period: PremiumBasePeriod) => {
    if (!onResolve || saving || item.basis.status === "invalid") return;
    setSaving(item.basis.key); setError(null);
    try { await onResolve(item.source, period); }
    catch (error) { setError(error instanceof Error ? error.message : "Potvrzení se nepodařilo uložit."); }
    finally { setSaving(null); }
  };
  return <details open={pending} className="m-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
    <summary className="cursor-pointer text-sm font-bold text-amber-950">{pending ? "Ověř období základny ve výpisu" : "Potvrzené základny z výpisů"}</summary>
    <p className="mt-2 text-xs leading-5 text-slate-600">Výpis může uvádět částku za jednu platbu i za celý rok. Potvrď období podle smlouvy nebo podkladu pojišťovny; samotná výše provize ho neurčuje.</p>
    {items.map(item => <div key={item.basis.status === "invalid" ? `${item.source.statementId}:${item.source.rowId}:${item.source.commissionCode}` : item.basis.key} className="mt-3 rounded-xl border border-amber-100 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>{item.source.statementPeriod || item.source.statementNumber} · {item.source.commissionCode}</span>
        {onOpenStatement && item.source.statementId && <button type="button" onClick={() => onOpenStatement(item.source.statementId!)} className="font-semibold text-violet-700 underline underline-offset-2">Zobrazit výpis</button>}
      </div>
      <p className="mt-1 text-sm font-bold text-slate-900">Základna ve výpisu: {formatMoney(item.source.basePremium)}</p>
      {item.basis.status === "invalid" ? <p className="mt-2 text-xs text-amber-900">Nejdřív doplň frekvenci placení smlouvy.</p> : <>
        {item.basis.status === "ambiguous" && <p className="mt-1 text-xs text-amber-900">Bez potvrzení se tato základna nezapočítá jako změna pojistného.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["payment", "annual"] as const).map(period => {
            const basis = item.basis;
            const selected = basis.status === "resolved" && basis.period === period;
            const annual = basis.status !== "invalid" ? (period === "annual" ? basis.annualIfAnnual : basis.annualIfPayment) : null;
            return <button key={period} type="button" aria-pressed={selected} disabled={!onResolve || saving !== null} onClick={() => void save(item, period)}
              className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold disabled:opacity-50 ${selected ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-700 hover:border-violet-300"}`}>
              {saving === basis.key && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" />}
              {period === "payment" ? "Je to za jednu platbu" : "Je to za celý rok"}{selected ? " ✓" : ""}
              {annual != null && <span className="mt-0.5 block font-normal">{formatMoney(annual)} ročně</span>}
            </button>;
          })}
        </div>
        {!onResolve && <p className="mt-2 text-xs text-slate-500">Období může potvrdit poradce s oprávněním upravovat smlouvu.</p>}
      </>}
    </div>)}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  </details>;
}
