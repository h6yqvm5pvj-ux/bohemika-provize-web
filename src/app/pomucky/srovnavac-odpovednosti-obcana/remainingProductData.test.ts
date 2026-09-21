import { describe, expect, it } from "vitest";
import { REMAINING_PRODUCT_IDS } from "./remainingProductData";
import { LIABILITY_PRODUCTS } from "./products";
import { LIABILITY_SECTIONS } from "./sections";
import { hasSectionComparison, getVisibleCriteria } from "./comparisonData";
import { GENERAL_SECTION } from "./generalData";
import { HISTORICAL_GENERAL_ANSWERS } from "./historicalGeneralData";
import { HISTORICAL_LIFE_SPORT_ANSWERS } from "./historicalLifeSportData";
import { HISTORICAL_BREEDER_ANSWERS } from "./historicalBreederData";
import { HISTORICAL_PROPERTY_ANSWERS } from "./historicalPropertyData";
import { HISTORICAL_TENANCY_ANSWERS } from "./historicalTenancyData";
import { HISTORICAL_COINSURED_ANSWERS } from "./historicalCoinsuredData";
import { COINSURED_SECTION } from "./coinsuredData";
import { LIFE_SPORT_SECTION } from "./lifeSportData";
import { buildLiabilityReport, initialExportSettings } from "./exportData";

const products = LIABILITY_PRODUCTS.filter((product) => REMAINING_PRODUCT_IDS.some((id) => product.id === id));

describe("posledních sedm produktů odpovědnosti", () => {
  it("připojí všech šest sekcí podle verzí a nepřenese je do jiné verze", () => {
    expect(products).toHaveLength(7);
    for (const id of REMAINING_PRODUCT_IDS) {
      expect(LIABILITY_SECTIONS.filter((section) => hasSectionComparison(section, id)).map((section) => section.id))
        .toEqual(["general", "life-sport", "breeder", "property", "tenancy", "coinsured"]);
      for (const section of LIABILITY_SECTIONS) {
        expect(hasSectionComparison(section, id.replace(/\d{4}-\d{2}-\d{2}$/, "2030-01-01"))).toBe(false);
        const criterionIds = section.criteria.map((row) => row.id);
        expect(Object.keys(section.answers[id] ?? {}).every((key) => criterionIds.includes(key))).toBe(true);
      }
    }
    for (const section of LIABILITY_SECTIONS) {
      expect(new Set(Object.keys(section.answers))).toEqual(new Set([
        ...LIABILITY_PRODUCTS.map((product) => product.id),
        ...(section.id === "general" ? Object.keys(HISTORICAL_GENERAL_ANSWERS) : []),
        ...(section.id === "life-sport" ? Object.keys(HISTORICAL_LIFE_SPORT_ANSWERS) : []),
        ...(section.id === "breeder" ? Object.keys(HISTORICAL_BREEDER_ANSWERS) : []),
        ...(section.id === "property" ? Object.keys(HISTORICAL_PROPERTY_ANSWERS) : []),
        ...(section.id === "tenancy" ? Object.keys(HISTORICAL_TENANCY_ANSWERS) : []),
        ...(section.id === "coinsured" ? Object.keys(HISTORICAL_COINSURED_ANSWERS) : []),
      ]));
    }
  });

  it("při porovnání variant Pillow zachová územní rozdíl a u shodných variant Slavie rozdíly nenajde", () => {
    expect(getVisibleCriteria(GENERAL_SECTION, REMAINING_PRODUCT_IDS.slice(0, 3), true, []).map((row) => row.id)).toEqual(["territory"]);
    expect(getVisibleCriteria(GENERAL_SECTION, REMAINING_PRODUCT_IDS.slice(4), true, [])).toEqual([]);
  });

  it("prázdné buňky ve zdroji zůstanou neznámé i v PDF", () => {
    const report = buildLiabilityReport([COINSURED_SECTION, LIFE_SPORT_SECTION], products, {
      ...initialExportSettings([COINSURED_SECTION, LIFE_SPORT_SECTION]), includeSubcriteria: true,
      selectedCriteria: { coinsured: ["children", "household-helpers"], "life-sport": ["electric-vehicles", "electric-vehicles-sidewalk"] },
    });
    const children = report.sections[0].rows.find((row) => row.id === "children")!;
    for (const id of REMAINING_PRODUCT_IDS.slice(4)) {
      expect(COINSURED_SECTION.answers[id]?.children).toBeUndefined();
      expect(children.cells[products.findIndex((product) => product.id === id)])
        .toEqual({ summary: "Údaj zatím není doplněn", tone: "neutral" });
    }
    const helper = report.sections[0].rows.find((row) => row.id === "household-helpers")!;
    expect(helper.cells[products.findIndex((product) => product.id === REMAINING_PRODUCT_IDS[3])].summary).toBe("Údaj zatím není doplněn");
    const electric = report.sections[1].rows.find((row) => row.id === "electric-vehicles")!;
    const sidewalk = report.sections[1].rows.find((row) => row.id === "electric-vehicles-sidewalk")!;
    for (const id of REMAINING_PRODUCT_IDS.slice(0, 3)) {
      const index = products.findIndex((product) => product.id === id);
      expect(electric.cells[index]).toEqual({ summary: "Údaj zatím není doplněn", tone: "neutral" });
      expect(sidewalk.cells[index].summary).toBe("Ano, vztahuje");
    }
  });

  it("zachová připojištění elektrovozítek Slavie i při tisku samotné definice bez podrobností", () => {
    const selected = [REMAINING_PRODUCT_IDS[3], REMAINING_PRODUCT_IDS[4]].map((id) => products.find((product) => product.id === id)!);
    const report = buildLiabilityReport([LIFE_SPORT_SECTION], selected, {
      ...initialExportSettings([LIFE_SPORT_SECTION]), includeSubcriteria: true, includeDetails: false, onlyDifferences: true,
      selectedCriteria: { "life-sport": ["electric-vehicles-definition"] },
    });
    expect(report.sections[0].rows).toHaveLength(1);
    const cells = report.sections[0].rows[0].cells;
    expect(cells[0].summary).toBe(cells[1].summary);
    expect(cells[0].context).toBeUndefined();
    expect(cells[1].context).toContain("Možno připojistit");
    expect(getVisibleCriteria(LIFE_SPORT_SECTION, selected.map((product) => product.id), true, ["electric-vehicles"]))
      .not.toContainEqual(expect.objectContaining({ id: "electric-vehicles-definition" }));
    expect(getVisibleCriteria(LIFE_SPORT_SECTION, selected.map((product) => product.id), true, []))
      .toContainEqual(expect.objectContaining({ id: "electric-vehicles-definition" }));
  });

  it("zachová omezení smluvní výpomoci Pillow při samostatném tisku a filtrování podkritéria", () => {
    const selected = products.filter((product) => [REMAINING_PRODUCT_IDS[0], REMAINING_PRODUCT_IDS[3]].some((id) => id === product.id));
    const report = buildLiabilityReport([COINSURED_SECTION], selected, {
      ...initialExportSettings([COINSURED_SECTION]), includeSubcriteria: true, includeDetails: false, onlyDifferences: true,
      selectedCriteria: { coinsured: ["contracted-helper-chores"] },
    });
    expect(report.sections[0].rows).toHaveLength(1);
    expect(report.sections[0].rows[0].cells[0].context).toContain("příležitostná činnost");
    expect(report.sections[0].rows[0].cells[1].context).toBeUndefined();
  });
});
