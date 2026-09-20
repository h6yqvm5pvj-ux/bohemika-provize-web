import { describe, expect, it } from "vitest";
import { ADDITIONAL_PRODUCT_IDS } from "./additionalProductData";
import { LIABILITY_PRODUCTS } from "./products";
import { LIABILITY_SECTIONS } from "./sections";
import { getVisibleCriteria, hasSectionComparison } from "./comparisonData";
import { GENERAL_SECTION, criterionHasDifferences } from "./generalData";
import { BREEDER_SECTION } from "./breederData";
import { LIFE_SPORT_SECTION } from "./lifeSportData";
import { PROPERTY_SECTION } from "./propertyData";
import { buildLiabilityReport, initialExportSettings } from "./exportData";
import { SCREENSHOT_PRODUCT_IDS, createScreenshotAnswers, included, excluded } from "./screenshotData";

describe("druhá sada podkladů odpovědnosti", () => {
  it("připojí každou odpověď ke správnému sloupci a chybějící buňky nevyplňuje", () => {
    const answers = createScreenshotAnswers(ADDITIONAL_PRODUCT_IDS, { test: [included, undefined, excluded, included, excluded] });
    expect(ADDITIONAL_PRODUCT_IDS.map((id) => answers[id]?.test)).toEqual([included, undefined, excluded, included, excluded]);
    expect(Object.keys(answers)).toEqual([...ADDITIONAL_PRODUCT_IDS]);
    expect(Object.keys(answers[ADDITIONAL_PRODUCT_IDS[1]]!)).toEqual([]);
  });

  it("používá pouze existující přesné verze a kritéria ve všech šesti sekcích", () => {
    const catalogIds = new Set(LIABILITY_PRODUCTS.map((product) => product.id));
    for (const section of LIABILITY_SECTIONS) {
      const criterionIds = section.criteria.map((row) => row.id).sort();
      for (const id of ADDITIONAL_PRODUCT_IDS) {
        expect(catalogIds.has(id)).toBe(true);
        expect(hasSectionComparison(section, id)).toBe(true);
        expect(Object.keys(section.answers[id]!).sort()).toEqual(criterionIds);
        expect(hasSectionComparison(section, id.replace(/\d{4}-\d{2}-\d{2}$/, "2030-01-01"))).toBe(false);
      }
    }
    expect(Object.keys(GENERAL_SECTION.answers)).toHaveLength(LIABILITY_PRODUCTS.length);
  });

  it("nová podkritéria zvířat zůstanou sbalená a starším podkladům nepřidá domyšlené odpovědi", () => {
    const selected = LIABILITY_PRODUCTS.filter((product) => [SCREENSHOT_PRODUCT_IDS[0], ADDITIONAL_PRODUCT_IDS[0]].some((id) => id === product.id));
    const visible = getVisibleCriteria(BREEDER_SECTION, selected.map((product) => product.id), false, ["other-pets"]);
    expect(visible.some((row) => row.parentId === "other-pets")).toBe(false);
    const report = buildLiabilityReport([BREEDER_SECTION], selected, { ...initialExportSettings([BREEDER_SECTION]), includeSubcriteria: true, selectedCriteria: { breeder: ["dangerous-animals"] } });
    expect(report.sections[0].rows[0].cells[0]).toMatchObject({ summary: "Údaj zatím není doplněn", tone: "neutral" });
    expect(report.sections[0].rows[0].cells[1]).toMatchObject({ summary: "Ano, vztahuje", tone: "positive" });
  });

  it("rozliší varianty UNIQA i podle detailů a zachová skutečně shodné sportovní podmínky", () => {
    const uniqaIds = ADDITIONAL_PRODUCT_IDS.slice(3);
    expect(criterionHasDifferences("territory", uniqaIds)).toBe(true);
    expect(criterionHasDifferences("negligence", uniqaIds)).toBe(false);
    expect(getVisibleCriteria(LIFE_SPORT_SECTION, uniqaIds, true, [])).toEqual([]);
    expect(getVisibleCriteria(BREEDER_SECTION, uniqaIds, true, []).map((row) => row.id)).toEqual(["livestock"]);
  });

  it("zachová podmínku připojištění z nadřazeného vlastnictví i při tisku samostatného typu nemovitosti", () => {
    const ids = [ADDITIONAL_PRODUCT_IDS[0], ADDITIONAL_PRODUCT_IDS[1]];
    const products = LIABILITY_PRODUCTS.filter((product) => ids.some((id) => id === product.id));
    expect(getVisibleCriteria(PROPERTY_SECTION, ids, true, []).some((row) => row.id === "other-home")).toBe(true);
    const report = buildLiabilityReport([PROPERTY_SECTION], products, { ...initialExportSettings([PROPERTY_SECTION]), includeSubcriteria: true, selectedCriteria: { property: ["other-home"] } });
    expect(report.sections[0].rows[0].cells[0].context).toBeUndefined();
    expect(report.sections[0].rows[0].cells[1].context).toContain("Možno připojistit");
  });
});
