"use client";

import { ShieldCheck } from "lucide-react";
import type { KoopOdzamDetail } from "@/app/lib/parseKoopOdzamPdf";
import { KoopOdzamCoverageRows } from "@/components/insurance/KoopOdzamCoverageRows";

export function CalculatorKoopOdzamPdfDetailSummary({ detail }: { detail: KoopOdzamDetail | null }) {
  if (!detail) return null;

  const fieldCount = Object.values(detail).filter((value) => value != null).length;
  if (!fieldCount) return null;

  return (
    <section
      className="rounded-[1.15rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.055)]"
      aria-label="PDF do detailu smlouvy: odpovědnost zaměstnance"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-slate-950">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white">
            <ShieldCheck size={16} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="truncate">PDF → detail smlouvy</span>
        </h2>
        <span className="shrink-0 text-[11px] font-bold text-slate-500">{fieldCount} polí</span>
      </div>
      <article className="mt-3 rounded-2xl border border-slate-300 bg-white p-3 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck size={16} aria-hidden="true" /> Odpovědnost zaměstnance
        </h3>
        <KoopOdzamCoverageRows detail={detail} />
      </article>
    </section>
  );
}
