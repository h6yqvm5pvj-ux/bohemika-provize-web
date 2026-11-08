"use client";

import { ShieldCheck } from "lucide-react";
import { formatMoney } from "@/app/lib/formatters";
import type { KoopMajetekCoverage } from "@/app/lib/parseKoopMajetekObcanPdf";

export function KoopMajetekDetailPanel({ coverages }: { coverages: readonly KoopMajetekCoverage[] }) {
  if (!coverages.length) return null;
  return <section className="grid grid-cols-1 gap-4" aria-label="Pojištěná rizika Kooperativa">
    {coverages.map((coverage, index) => <article key={`${coverage.name}-${index}`} className="rounded-2xl border border-slate-300 bg-white p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-slate-500"><ShieldCheck size={16} aria-hidden="true" />{coverage.name}</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {coverage.variant && <div className="flex items-start justify-between gap-4"><dt className="text-sm text-slate-600">Varianta pojištění</dt><dd className="text-right text-sm font-semibold text-slate-900">{coverage.variant}</dd></div>}
        {coverage.sumInsured != null && <div className="flex items-start justify-between gap-4"><dt className="text-sm text-slate-600">Pojistná částka / limit plnění</dt><dd className="text-right text-sm font-semibold text-slate-900">{formatMoney(coverage.sumInsured)}</dd></div>}
        {coverage.deductible != null && <div className="flex items-start justify-between gap-4"><dt className="text-sm text-slate-600">Spoluúčast</dt><dd className="text-right text-sm font-semibold text-slate-900">{formatMoney(coverage.deductible)}</dd></div>}
      </dl>
    </article>)}
  </section>;
}
