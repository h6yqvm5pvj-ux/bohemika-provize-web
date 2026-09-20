import { describe, expect, it } from "vitest";
import { buildLiabilityReport, initialExportSettings } from "./exportData";
import { LIABILITY_SECTIONS } from "./sections";
import { LIABILITY_PRODUCTS } from "./products";
import { SCREENSHOT_PRODUCT_IDS } from "./screenshotData";

const products = LIABILITY_PRODUCTS.filter((product) => SCREENSHOT_PRODUCT_IDS.some((id) => id === product.id));

describe("výběr obsahu PDF", () => {
  it("začíná hlavními kritérii a podrobnostmi, podkritéria lze přidat", () => {
    const settings = initialExportSettings(LIABILITY_SECTIONS);
    const report = buildLiabilityReport(LIABILITY_SECTIONS, products, settings);
    expect(report.sections).toHaveLength(6);
    expect(report.sections.flatMap((section) => section.rows).every((row) => !row.parentLabel)).toBe(true);
    const full = buildLiabilityReport(LIABILITY_SECTIONS, products, { ...settings, includeSubcriteria: true });
    expect(full.sections.flatMap((section) => section.rows)).toHaveLength(83);
  });

  it("vytiskne pouze zvolenou sekci a jednotlivé kritérium", () => {
    const settings = { ...initialExportSettings(LIABILITY_SECTIONS), selectedCriteria: { breeder: ["dog"] } };
    const report = buildLiabilityReport(LIABILITY_SECTIONS, products, settings);
    expect(report.sections.map((section) => section.id)).toEqual(["breeder"]);
    expect(report.sections[0].rows.map((row) => row.id)).toEqual(["dog"]);
    expect(report.sections[0].rows[0].cells[3].tone).toBe("warning");
  });

  it("zachová podmínku připojištění, i když nadřazený řádek není vybrán", () => {
    const settings = { ...initialExportSettings(LIABILITY_SECTIONS), includeSubcriteria: true, includeDetails: false, selectedCriteria: { property: ["other-home"] } };
    const report = buildLiabilityReport(LIABILITY_SECTIONS, products, settings);
    expect(report.sections[0].rows[0].cells[3].context).toContain("Možno připojistit");
    expect(report.sections[0].rows[0].parentLabel).toContain("Další nemovitosti");
  });

  it("porovnává pouze vybrané produkty a údaje zahrnuté v exportu", () => {
    const settings = { ...initialExportSettings(LIABILITY_SECTIONS), onlyDifferences: true, selectedCriteria: { general: ["maximum-limit"] } };
    const selected = products.filter((product) => [SCREENSHOT_PRODUCT_IDS[1], SCREENSHOT_PRODUCT_IDS[2]].some((id) => id === product.id));
    expect(buildLiabilityReport(LIABILITY_SECTIONS, selected, settings).sections).toHaveLength(1);
    expect(buildLiabilityReport(LIABILITY_SECTIONS, selected, { ...settings, includeDetails: false }).sections).toHaveLength(0);
  });

  it("zachová rozdíl v podmínce krytí i při shodných stručných odpovědích", () => {
    const settings = { ...initialExportSettings(LIABILITY_SECTIONS), onlyDifferences: true, includeSubcriteria: true, includeDetails: false, selectedCriteria: { property: ["other-home"] } };
    const selected = products.filter((product) => [SCREENSHOT_PRODUCT_IDS[1], SCREENSHOT_PRODUCT_IDS[3]].some((id) => id === product.id));
    expect(buildLiabilityReport(LIABILITY_SECTIONS, selected, settings).sections[0].rows).toHaveLength(1);
  });

  it("nevkládá nevybrané řádky a nemění původní odpovědi", () => {
    const before = JSON.stringify(LIABILITY_SECTIONS);
    expect(buildLiabilityReport(LIABILITY_SECTIONS, products, { ...initialExportSettings(LIABILITY_SECTIONS), selectedCriteria: {} }).sections).toEqual([]);
    buildLiabilityReport(LIABILITY_SECTIONS, products, { ...initialExportSettings(LIABILITY_SECTIONS), includeDetails: false });
    expect(JSON.stringify(LIABILITY_SECTIONS)).toBe(before);
  });
});
