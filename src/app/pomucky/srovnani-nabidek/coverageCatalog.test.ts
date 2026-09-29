import { describe, expect, it } from "vitest";
import { addOffer, appendCoverage, appendTemplate, changeRowCoverage, comparisonCellText, createDocument, parseDocument } from "./model";
import { COVERAGE_CATALOG, catalogDefinition, catalogDetailsText, createCatalogDetails } from "./coverageCatalog";

describe("supplemental and motor insurance comparison", () => {
  it("round-trips every catalog risk and its editable fields without assuming coverage", () => {
    let doc = createDocument();
    for (const definition of COVERAGE_CATALOG) {
      doc = appendCoverage(doc, definition.id);
      const details = createCatalogDetails(definition.id);
      expect(catalogDetailsText(details)).toBe("");
      for (const field of catalogDefinition(definition.id).fields) details.values[field.id] = field.options ? field.options.map(option => option.id).slice(0, field.multiple ? undefined : 1).join("|") : "1 234";
      doc.rows.at(-1)!.cells[doc.offers[0].id].details = details;
    }
    expect(parseDocument(JSON.stringify(doc))).toEqual(doc);
  });

  it("formats liability units and includes only the active deductible without deleting hidden values", () => {
    const liability = createCatalogDetails("auto-liability");
    liability.values.healthLimit = "100"; liability.values.propertyLimit = "150";
    expect(catalogDetailsText(liability)).toBe("Limity odpovědnosti: 100/150 mil. Kč");
    liability.values.propertyLimit = "";
    expect(catalogDetailsText(liability)).toBe("Limity odpovědnosti: 100 mil. Kč / Neuvedeno");
    const collision = createCatalogDetails("auto-collision");
    Object.assign(collision.values, { amount: "700 000", risks: "collision|theft", deductibleType: "percent-min", deductiblePercent: "5", deductibleMin: "5 000", deductibleFixed: "123 456" });
    expect(catalogDetailsText(collision)).toContain("Sjednaná rizika: Havárie, Odcizení");
    expect(catalogDetailsText(collision)).toContain("Spoluúčast: 5 %, min. 5 000 Kč");
    expect(catalogDetailsText(collision)).not.toContain("Procentní s minimem");
    expect(catalogDetailsText(collision)).not.toContain("123 456");
    collision.values.deductibleType = "none";
    expect(catalogDetailsText(collision)).toContain("Bez spoluúčasti");
    expect(catalogDetailsText(collision)).not.toContain("5 000");
    expect(collision.values.deductibleMin).toBe("5 000");
    collision.values.deductibleType = "fixed";
    expect(catalogDetailsText(collision)).toContain("Spoluúčast: 123 456 Kč");
    expect(catalogDetailsText(collision)).not.toContain("min.");
    collision.values.deductibleType = "percent";
    expect(catalogDetailsText(collision)).toContain("Spoluúčast: 5 %");
    expect(catalogDetailsText(collision)).not.toContain("min.");
    collision.values.deductibleType = "custom";
    collision.values.deductibleCustom = "10 %, min. 10 000 Kč v zahraničí";
    expect(catalogDetailsText(collision)).toContain("Spoluúčast: 10 %, min. 10 000 Kč v zahraničí");
    expect(catalogDetailsText({ ...collision, status: "excluded" })).toBe("Nesjednáno");
  });

  it("keeps new offers independent and retains existing terms when converting to custom rows", () => {
    let doc = appendCoverage(createDocument(), "auto-assistance");
    const first = doc.offers[0].id, details = createCatalogDetails("auto-assistance");
    Object.assign(details.values, { events: "breakdown|tyre", towingCz: "Bez limitu", towingAbroad: "500 km", replacement: "7 dní" });
    doc.rows[0].cells[first].details = details;
    doc.rows[0].cells[first].text = "I pro přívěs.";
    doc = addOffer(doc);
    expect(doc.rows[0].cells[doc.offers[2].id].details).toEqual(createCatalogDetails("auto-assistance"));
    const row = changeRowCoverage(doc.rows[0]);
    expect(row.coverage).toBeUndefined();
    for (const term of ["Bez limitu", "500 km", "7 dní", "Porucha, Defekt", "I pro přívěs."]) expect(comparisonCellText(row.cells[first])).toContain(term);
  });

  it("uses the core motor set and preserves one shared disability row in the life set", () => {
    const motor = appendTemplate(createDocument(), "auto");
    expect(motor.rows.filter(row => row.kind === "item").map(row => row.coverage)).toEqual(["auto-liability", "auto-collision", "auto-glass", "auto-assistance"]);
    const life = appendTemplate(createDocument(), "life");
    expect(life.rows.filter(row => row.coverage === "disability")).toHaveLength(1);
    expect(life.rows.filter(row => row.kind === "item")).toHaveLength(5);
  });

  it.each(["unknown-choice", "duplicate-choice", "extra-field", "object-value", "wrong-kind"])("rejects invalid imported catalog fields: %s", variant => {
    const doc = appendCoverage(createDocument(), "auto-collision");
    const details = createCatalogDetails("auto-collision");
    const raw = JSON.parse(JSON.stringify(details));
    if (variant === "unknown-choice") raw.values.risks = "collision|unknown";
    if (variant === "duplicate-choice") raw.values.risks = "collision|collision";
    if (variant === "extra-field") raw.values.untrusted = "something";
    if (variant === "object-value") raw.values.amount = { value: "500" };
    if (variant === "wrong-kind") raw.kind = "life-aid";
    doc.rows[0].cells[doc.offers[0].id].details = raw;
    expect(() => parseDocument(JSON.stringify(doc))).toThrow("neplatné parametry připojištění");
  });
});
