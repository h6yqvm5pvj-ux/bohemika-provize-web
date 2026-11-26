"use client";

import { ShieldCheck } from "lucide-react";
import { InsuranceDetailHeading } from "@/components/insurance/InsuranceDetailHeading";
import detailStyles from "@/components/insurance/insuranceDetail.module.css";
import { formatMoney } from "@/app/lib/formatters";
import type { KoopMajetekCoverage } from "@/app/lib/parseKoopMajetekObcanPdf";

export function KoopMajetekDetailPanel({ coverages }: { coverages: readonly KoopMajetekCoverage[] }) {
  if (!coverages.length) return null;
  return <section className="grid grid-cols-1 gap-4" aria-label="Pojištěná rizika Kooperativa">
    {coverages.map((coverage, index) => <article key={`${coverage.name}-${index}`} className={detailStyles.card} data-detail-tone={index % 2 === 0 ? "sky" : "emerald"}>
      <InsuranceDetailHeading icon={ShieldCheck}>{coverage.name}</InsuranceDetailHeading>
      <dl className={detailStyles.fields}>
        {coverage.variant && <div className={detailStyles.field}><dt>Varianta pojištění</dt><dd>{coverage.variant}</dd></div>}
        {coverage.sumInsured != null && <div className={detailStyles.field} data-highlight="true"><dt>Pojistná částka / limit plnění</dt><dd>{formatMoney(coverage.sumInsured)}</dd></div>}
        {coverage.deductible != null && <div className={detailStyles.field}><dt>Spoluúčast</dt><dd>{formatMoney(coverage.deductible)}</dd></div>}
      </dl>
    </article>)}
  </section>;
}
