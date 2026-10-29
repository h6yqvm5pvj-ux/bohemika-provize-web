"use client";

import { useId, useState } from "react";
import { History } from "lucide-react";
import type { LifeStatementPremiumChange } from "@/app/lib/lifePremiumIncrease";
import { ContractSectionToggle } from "./ContractSectionToggle";
import { formatMoney } from "./contractDetailHelpers";

export function ContractLifePremiumChanges({ changes, onOpenStatement }: {
  changes: LifeStatementPremiumChange[]; onOpenStatement: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  if (!changes.length) return null;
  const rows = [...changes].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Potvrzené změny pojistného">
    <ContractSectionToggle title="Změny pojistného" icon={<History size={17} />} count={String(rows.length)}
      expanded={expanded} contentId={contentId} onToggle={() => setExpanded(value => !value)} />
    <div id={contentId} hidden={!expanded}>
      <p className="mt-3 text-sm text-slate-600">Potvrzené pojistné podle podkladů ke smlouvě.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Účinnost</th><th className="p-2">Původní měsíčně</th><th className="p-2">Nové měsíčně</th><th className="p-2">Výpis</th></tr></thead>
        <tbody>{rows.map(change => <tr key={change.key} className="border-t border-slate-100">
          <td className="p-2">{change.effectiveDate.split("-").reverse().join(". ")}</td>
          <td className="p-2">{formatMoney(change.previousMonthlyPremium)}</td>
          <td className="p-2 font-semibold text-emerald-700">{formatMoney(change.newMonthlyPremium)}</td>
          <td className="p-2"><button type="button" className="font-semibold text-violet-800 underline" onClick={() => onOpenStatement(change.statementId)}>
            {change.statementNumber ? `Výpis ${change.statementNumber}` : "Zdrojový výpis"}
          </button></td>
        </tr>)}</tbody>
      </table></div>
    </div>
  </section>;
}
