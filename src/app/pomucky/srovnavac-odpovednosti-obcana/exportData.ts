import { comparisonAnswersDiffer, getCoverageConditions, type ComparisonSectionData, type ComparisonTone } from "./comparisonData";
import type { LiabilityProduct } from "./products";

export type ExportSettings = {
  selectedCriteria: Record<string, string[]>;
  includeSubcriteria: boolean;
  includeDetails: boolean;
  onlyDifferences: boolean;
};

export type ExportCell = { summary: string; detail?: string; context?: string; tone: ComparisonTone };
export type ExportRow = { id: string; title: string; parentLabel?: string; cells: ExportCell[] };
export type ExportSection = { id: string; title: string; rows: ExportRow[] };
export type LiabilityReport = { products: LiabilityProduct[]; sections: ExportSection[]; includeDetails: boolean; onlyDifferences: boolean };

export function initialExportSettings(sections: readonly ComparisonSectionData[]): ExportSettings {
  return {
    selectedCriteria: Object.fromEntries(sections.map((section) => [section.id, section.criteria.map((row) => row.id)])),
    includeSubcriteria: false,
    includeDetails: true,
    onlyDifferences: false,
  };
}

export function buildLiabilityReport(sections: readonly ComparisonSectionData[], products: LiabilityProduct[], settings: ExportSettings): LiabilityReport {
  const reportSections = sections.map((section): ExportSection => {
    const rows = section.criteria
      .filter((row) => settings.selectedCriteria[section.id]?.includes(row.id) && (settings.includeSubcriteria || !row.parentId))
      .map((row): ExportRow => ({
        id: row.id, title: row.title, parentLabel: row.parentLabel,
        cells: products.map((product) => {
          const answer = section.answers[product.id]?.[row.id];
          const conditions = getCoverageConditions(section, row, product.id);
          const context = conditions.length ? `Podmínky hlavního krytí: ${conditions.map((coverage) =>
            `${coverage.summary}${settings.includeDetails && coverage.detail ? ` ${coverage.detail}` : ""}`).join(" · ")}` : undefined;
          return answer
            ? { summary: answer.summary, tone: answer.tone, detail: settings.includeDetails ? answer.detail : undefined, context }
            : { summary: "Údaj zatím není doplněn", tone: "neutral" };
        }),
      }))
      .filter((row) => !settings.onlyDifferences || comparisonAnswersDiffer(row.cells.map((cell) => ({
        summary: cell.summary, tone: cell.tone, detail: [cell.detail, cell.context].filter(Boolean).join("\n"),
      }))));
    return { id: section.id, title: section.title, rows };
  }).filter((section) => section.rows.length > 0);
  return { products, sections: reportSections, includeDetails: settings.includeDetails, onlyDifferences: settings.onlyDifferences };
}
