import type { ReportAdvisor } from "../neon-life-vs-metlife-oneguard/comparisonReportContent";
import { createLiabilityPdf } from "../srovnavac-odpovednosti-obcana/comparisonPdf";
import type { ExportCell, ExportSection, LiabilityReport } from "../srovnavac-odpovednosti-obcana/exportData";
import { BENCHMARKS, COUNTERWEIGHTS, REVIEW_DATE, SCOPE, SECTIONS, SOURCES, STATUS_LABELS, TOPICS, evidenceHref, evidenceLabel, formatMoney, progression, type Evidence } from "./comparisonData";

export type ComparisonPdfSettings = { selectedIds: readonly string[]; insuredSum: number; percent: number };
export type ComparisonPdfOptions = ComparisonPdfSettings & { advisor: ReportAdvisor; generatedAt?: Date };
const products: LiabilityReport["products"] = [
  { id: "neon-life-2026", insurerName: "ČPP", productName: "NEON Life", date: "DPP 0426 · 1. 4. 2026 · brožura 16.1", logoPath: "/icons/cpp.png" },
  { id: "bel-mondo-20-2024", insurerName: "Generali Česká", productName: "Bel Mondo 20 – riziková varianta", date: "02/2024 v03 · ZPP-ŽPR-BM20-0006", logoPath: "/icons/generali.png" },
];
const links = (evidence: readonly Evidence[], insurer: Evidence["insurer"]) => evidence.filter((source) => source.insurer === insurer).map((source) => ({ label: evidenceLabel(source), url: evidenceHref(source) }));

export function buildComparisonReport(settings: ComparisonPdfSettings): LiabilityReport {
  const selected = new Set(settings.selectedIds);
  const picked = TOPICS.filter((row) => selected.has(row.id));
  if (!picked.length) throw new Error("Vyber alespoň jedno téma do PDF.");
  const model = progression(settings.percent, settings.insuredSum);
  const sections: ExportSection[] = [{
    id: "scope", title: "Jak používat srovnání",
    rows: [{ id: "scope", title: "Rozsah a verze", cells: [
      { summary: SOURCES.cpp.version, detail: SCOPE, tone: "neutral", links: [{ label: "Otevřít úplné podmínky ČPP", url: SOURCES.cpp.url }] },
      { summary: SOURCES.generali.version, detail: `Kontrola podmínek: ${REVIEW_DATE}. ${picked.length} vybraných témat; důležité protiváhy jsou vždy přiloženy. „Ověřeno“ označuje parametr, nikoli vhodnost pro konkrétního klienta.`, tone: "neutral", links: [{ label: "Otevřít úplné podmínky Generali", url: SOURCES.generali.url }] },
    ] }],
  }];
  for (const section of SECTIONS) {
    const rows = picked.filter((row) => row.section === section.id).map((row) => ({
      id: row.id, title: `${row.id} · ${row.title}`, parentLabel: `${row.kind} · ${STATUS_LABELS[row.status]}`,
      cells: (["cpp", "generali"] as const).map((insurer): ExportCell => ({
        summary: row[insurer], detail: `Podmínky a omezení: ${row.conditions}`,
        tone: row.status === "převzato_neověřeno" ? "warning" : "neutral", links: links(row.evidence, insurer),
      })),
    }));
    if (rows.length) sections.push({ ...section, rows });
    if (section.id === "U" && selected.has("U01")) {
      sections.push({ id: "progression", title: "U01 · Model desetinásobné progrese", rows: [
        { id: "model", title: `${settings.percent} % následků`, parentLabel: `Základní částka ${formatMoney(settings.insuredSum)}`, cells: [
          { summary: formatMoney(model.cpp), context: `${model.cppPercent} % základní částky`, detail: `Rozdíl: ${formatMoney(model.difference)}. Stejné procento následků; bez bonusů. Konkrétní úraz může mít u každé pojišťovny jiné ohodnocení.`, tone: "neutral", links: links(TOPICS.find((row) => row.id === "U01")!.evidence, "cpp") },
          { summary: formatMoney(model.generali), context: `${model.generaliPercent} % základní částky`, detail: "Obě pojišťovny dosahují maxima 1 000 %. Toto je model tabulkové progrese, nikoli příslib likvidace konkrétního úrazu.", tone: "neutral", links: links(TOPICS.find((row) => row.id === "U01")!.evidence, "generali") },
        ] },
        ...BENCHMARKS.map((percent) => {
          const result = progression(percent, settings.insuredSum);
          return { id: `benchmark-${percent}`, title: `${percent} % následků`, cells: [
            { summary: `${result.cppPercent} % · ${formatMoney(result.cpp)}`, tone: "neutral" as const },
            { summary: `${result.generaliPercent} % · ${formatMoney(result.generali)}`, tone: "neutral" as const },
          ] };
        }),
      ] });
    }
  }
  sections.push({ id: "counterweights", title: "Důležité protiváhy před doporučením", rows: COUNTERWEIGHTS.map((row) => ({
    id: row.id, title: `${row.id} · ${row.title}`, cells: (["cpp", "generali"] as const).map((insurer) => ({
      summary: row[insurer], detail: row.conditions, tone: "warning", links: links(row.evidence, insurer),
    })),
  })) });
  return { products, sections, includeDetails: true, onlyDifferences: false };
}

export async function createComparisonPdf({ advisor, generatedAt, ...settings }: ComparisonPdfOptions) {
  return createLiabilityPdf({
    report: buildComparisonReport(settings), advisor, generatedAt,
    presentation: {
      title: "NEON Life vs. Bel Mondo 20",
      subtitle: `ČPP 04/2026 · Generali riziková varianta 02/2024 v03 · kontrola ${REVIEW_DATE}`,
      footer: "Sjednaná varianta a výluky rozhodují. Zdroje a jejich verze jsou uvedeny v přehledu.",
      advisorInFooter: true,
      continuousSections: true,
    },
  });
}
