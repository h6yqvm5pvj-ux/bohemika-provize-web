"use client";

import { BriefcaseBusiness, CarFront, Coins, MapPin, Percent, type LucideIcon } from "lucide-react";
import { formatMoney } from "@/app/lib/formatters";
import type { KoopOdzamDetail } from "@/app/lib/parseKoopOdzamPdf";

type CoverageRow = {
  label: string;
  value: string;
  Icon: LucideIcon;
};

export function KoopOdzamCoverageRows({ detail }: { detail: KoopOdzamDetail }) {
  const rows: CoverageRow[] = [];
  if (detail.occupation) rows.push({ label: "Povolání", value: detail.occupation, Icon: BriefcaseBusiness });
  if (detail.vehicleRelatedDamage != null) {
    rows.push({
      label: "Škoda související s řízením a provozem dopravního prostředku",
      value: detail.vehicleRelatedDamage ? "Ano" : "Ne",
      Icon: CarFront,
    });
  }
  if (detail.annualLimit != null) {
    rows.push({ label: "Roční limit plnění", value: formatMoney(detail.annualLimit), Icon: Coins });
  }
  if (detail.territorialScope) {
    rows.push({ label: "Územní rozsah", value: detail.territorialScope, Icon: MapPin });
  }
  if (detail.deductible) rows.push({ label: "Spoluúčast", value: detail.deductible, Icon: Percent });

  return (
    <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {rows.map(({ label, value, Icon }) => (
        <div key={label} className="min-w-0">
          <dt className="mb-1 flex items-start gap-2 text-xs font-medium text-slate-500">
            <span className="mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <Icon size={14} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="pt-1 leading-snug">{label}</span>
          </dt>
          <dd className="pl-8 break-words text-sm font-semibold text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
