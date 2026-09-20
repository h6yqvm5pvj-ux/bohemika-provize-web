import type { ComparisonAnswer, ComparisonCriterion, ComparisonSectionData } from "./comparisonData";

// Pevné pořadí a přesné verze pěti produktů v dodaných screenshotech.
export const SCREENSHOT_PRODUCT_IDS = [
  "allianz:mujdomov-2026-06-25",
  "cpp:domex-plus-2023-10-01",
  "csob:nase-odpovednost-2025-06-16",
  "direct:majetkove-pojisteni-2025-10-16",
  "generali:muj-majetek-2-0-2026-06-13",
] as const;

export const included: ComparisonAnswer = { summary: "Ano, vztahuje", tone: "positive" };
export const excluded: ComparisonAnswer = { summary: "Není součástí", tone: "negative" };
export const notCovered: ComparisonAnswer = { summary: "Nevztahuje", tone: "negative" };
export const optional: ComparisonAnswer = { summary: "Možno připojistit", tone: "warning" };
export const positive = (summary: string, detail?: string): ComparisonAnswer => ({ summary, detail, tone: "positive" });
export const negative = (summary: string): ComparisonAnswer => ({ summary, tone: "negative" });
export const neutral = (summary: string, detail?: string): ComparisonAnswer => ({ summary, detail, tone: "neutral" });
export const warning = (summary: string, detail?: string): ComparisonAnswer => ({ summary, detail, tone: "warning" });

type ScreenshotValues<P extends readonly string[]> = { readonly [Index in keyof P]: ComparisonAnswer | undefined };
type ScreenshotRow = ComparisonCriterion & { values: ScreenshotValues<typeof SCREENSHOT_PRODUCT_IDS> };

// Každá sada má vlastní pořadí sloupců. Nedodané odpovědi zůstávají chybějící.
export function createScreenshotAnswers<K extends string, const P extends readonly string[]>(
  productIds: P,
  rows: Record<K, NoInfer<ScreenshotValues<P>>>,
): Partial<Record<string, Record<K, ComparisonAnswer>>> {
  return Object.fromEntries(productIds.map((id, index) => [
    id, Object.fromEntries(Object.entries<readonly (ComparisonAnswer | undefined)[]>(rows)
      .flatMap(([criterionId, values]) => values[index] ? [[criterionId, values[index]]] : [])),
  ])) as Partial<Record<string, Record<K, ComparisonAnswer>>>;
}

export function createScreenshotSection(
  metadata: Pick<ComparisonSectionData, "id" | "title" | "number">,
  rows: readonly ScreenshotRow[],
  additionalAnswers: ComparisonSectionData["answers"] = {},
): ComparisonSectionData {
  return {
    ...metadata,
    criteria: rows.map((row) => ({
      id: row.id, title: row.title, parentId: row.parentId,
      parentLabel: row.parentLabel, coverageParentId: row.coverageParentId,
    })),
    answers: {
      ...createScreenshotAnswers(SCREENSHOT_PRODUCT_IDS, Object.fromEntries(rows.map((row) => [row.id, row.values]))),
      ...additionalAnswers,
    },
  };
}
