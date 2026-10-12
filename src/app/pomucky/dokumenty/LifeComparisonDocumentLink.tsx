import Link from "next/link";
import { ArrowUpRight, FileCheck2 } from "lucide-react";
import { COMPARISON_HREF, COMPARISON_TITLE, normalizeSearch } from "../neon-life-vs-generali-bel-mondo-20/comparisonData";

export function comparisonDocumentMatches(query: string) {
  return normalizeSearch(`${COMPARISON_TITLE} srovnání životní pojištění pomůcka PDF 2026 2024 invalidita úraz nemoc IVF`).includes(normalizeSearch(query));
}

export function LifeComparisonDocumentLink() {
  return <Link href={COMPARISON_HREF} className="mb-5 flex items-center gap-4 rounded-2xl border border-purple-200 bg-purple-50/70 p-5 text-[#493354] transition-colors hover:bg-purple-100/70">
    <FileCheck2 size={27} aria-hidden="true" className="shrink-0 text-[#79558f]" />
    <div className="flex-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-[#79558f]">Srovnávací pomůcka · PDF s vizitkou</span><h3 className="mt-1 text-sm font-semibold">{COMPARISON_TITLE}</h3><p className="mt-1 text-xs leading-relaxed text-[#82708e]">49 témat, model progrese a důležité protiváhy. NEON 2026 a Bel Mondo 20 v rizikové variantě 02/2024.</p></div>
    <ArrowUpRight size={18} aria-hidden="true" className="shrink-0" />
  </Link>;
}
