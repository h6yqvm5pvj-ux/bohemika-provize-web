import { createLifeDetails, LIFE_COVERAGES, lifeDetailsText, parseLifeDetails, type LifeCoverageKind, type LifeDetails } from "./lifeCoverage";
import { COVERAGE_CATALOG, createCatalogDetails, catalogDetailsText, parseCatalogDetails, type CatalogCoverageKind, type CatalogDetails } from "./coverageCatalog";

export type CoverageKind = LifeCoverageKind | CatalogCoverageKind;
export type CoverageDetails = LifeDetails | CatalogDetails;
export const ALL_COVERAGES = [
  ...LIFE_COVERAGES.map(item => ({ ...item, category: "life" as const, group: "Základní rizika" })),
  ...COVERAGE_CATALOG,
];
export const isLifeCore = (kind: CoverageKind): kind is LifeCoverageKind => LIFE_COVERAGES.some(item => item.id === kind);
export const createCoverageDetails = (kind: CoverageKind): CoverageDetails => isLifeCore(kind) ? createLifeDetails(kind) : createCatalogDetails(kind);
export const coverageDetailsText = (details: CoverageDetails) => "values" in details ? catalogDetailsText(details) : lifeDetailsText(details);
export const parseCoverageDetails = (value: unknown, kind: CoverageKind) => isLifeCore(kind) ? parseLifeDetails(value, kind) : parseCatalogDetails(value, kind);

/** Group consecutive keystrokes only within the same parameter for useful undo steps. */
export function coverageEditKey(before: CoverageDetails | undefined, after: CoverageDetails): string | undefined {
  if (!before || before.kind !== after.kind) return;
  const flatten = (value: CoverageDetails) => Object.entries(value).flatMap(([key, field]) =>
    typeof field === "object" ? Object.entries(field).map(([child, value]) => [`${key}.${child}`, value] as const) : [[key, field] as const]);
  const previous = new Map(flatten(before));
  const changed = flatten(after).filter(([key, value]) => previous.get(key) !== value);
  return changed.length === 1 ? changed[0][0] : undefined;
}
