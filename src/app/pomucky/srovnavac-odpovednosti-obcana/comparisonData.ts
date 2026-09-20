export type ComparisonTone = "positive" | "warning" | "negative" | "neutral";

export type ComparisonAnswer = {
  summary: string;
  detail?: string;
  tone: ComparisonTone;
};

export type ComparisonCriterion = {
  id: string;
  title: string;
  parentId?: string;
  parentLabel?: string;
  coverageParentId?: string;
};

export type ComparisonSectionData = {
  id: string;
  title: string;
  number: string;
  criteria: readonly ComparisonCriterion[];
  answers: Partial<Record<string, Record<string, ComparisonAnswer>>>;
};

export function comparisonAnswersDiffer(answers: (ComparisonAnswer | undefined)[]): boolean {
  if (answers.length < 2) return false;
  const signatures = answers.map((answer) => {
    if (!answer) return "missing";
    return JSON.stringify(
      [answer.summary, answer.detail ?? "", answer.tone]
        .map((value) => value.trim().replace(/\s+/g, " ")),
    );
  });
  return new Set(signatures).size > 1;
}

export function hasSectionComparison(section: ComparisonSectionData, productId: string): boolean {
  return section.criteria.some((criterion) => section.answers[productId]?.[criterion.id] !== undefined);
}

function coverageCriteria(section: ComparisonSectionData, criterion: ComparisonCriterion): ComparisonCriterion[] {
  const result: ComparisonCriterion[] = [];
  const visited = new Set([criterion.id]);
  let parentId = criterion.coverageParentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = section.criteria.find((row) => row.id === parentId);
    if (!parent) break;
    result.push(parent);
    parentId = parent.coverageParentId;
  }
  return result;
}

// Podmínky připojištění se neztrácejí ani při samostatném zobrazení nebo tisku potomka.
export function getCoverageConditions(section: ComparisonSectionData, criterion: ComparisonCriterion, productId: string): ComparisonAnswer[] {
  const answer = section.answers[productId]?.[criterion.id];
  if (!answer || answer.tone === "negative") return [];
  const conditions = coverageCriteria(section, criterion)
    .flatMap((row) => section.answers[productId]?.[row.id] ?? [])
    .filter((coverage) => coverage.detail || !["Ano", "Ano, vztahuje"].includes(coverage.summary));
  return conditions.filter((coverage, index) => conditions.findIndex((other) =>
    !comparisonAnswersDiffer([coverage, other])) === index);
}

export function getVisibleCriteria(
  section: ComparisonSectionData,
  productIds: string[],
  onlyDifferences: boolean,
  collapsedGroups: string[],
): ComparisonCriterion[] {
  const relevantIds = new Set<string>();
  if (onlyDifferences) {
    const byId = new Map(section.criteria.map((criterion) => [criterion.id, criterion]));
    for (const criterion of section.criteria) {
      const differs = comparisonAnswersDiffer(productIds.map((id) => section.answers[id]?.[criterion.id]))
        || coverageCriteria(section, criterion).some((parent) => comparisonAnswersDiffer(productIds.map((id) => section.answers[id]?.[parent.id])));
      if (!differs) continue;
      // Shodný rodič zůstává dostupný jako ovládání skrytých rozdílů v podkritériích.
      let current: ComparisonCriterion | undefined = criterion;
      while (current && !relevantIds.has(current.id)) {
        relevantIds.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
  }
  return section.criteria.filter((criterion) => {
    if (onlyDifferences && !relevantIds.has(criterion.id)) return false;
    let parentId = criterion.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      if (collapsedGroups.includes(parentId)) return false;
      visited.add(parentId);
      parentId = section.criteria.find((item) => item.id === parentId)?.parentId;
    }
    return true;
  });
}
