"use client";

import { ShieldCheck } from "lucide-react";
import type { KoopOdzamDetail } from "@/app/lib/parseKoopOdzamPdf";
import { KoopOdzamCoverageRows } from "@/components/insurance/KoopOdzamCoverageRows";

export function KoopOdzamDetailPanel({ detail }: { detail: KoopOdzamDetail | null }) {
  if (!detail || !Object.values(detail).some((value) => value != null)) return null;

  return (
    <section
      className="rounded-2xl border border-slate-300 bg-white p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]"
      aria-label="PDF do detailu smlouvy: odpovědnost zaměstnance"
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-slate-500">
        <ShieldCheck size={16} aria-hidden="true" /> Odpovědnost zaměstnance
      </h3>
      <KoopOdzamCoverageRows detail={detail} />
    </section>
  );
}
