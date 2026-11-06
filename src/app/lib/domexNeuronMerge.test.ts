import { describe, expect, it } from "vitest";
import { domexNeuronDataFixture, domexNeuronObjectFixture } from "../../../tests/helpers/domexNeuronFixture";
import { createDomexNeuronDataFromLegacy, mergeDomexNeuronPdfData, projectDomexNeuronLegacy } from "./domexNeuronMerge";
import { normalizeDomexNeuronData } from "./domexNeuronValidation";

describe("DOMEX Neuron object migration and PDF reimport", () => {
  it("does not invent insurance or a parser version from an empty or household-only legacy record", () => {
    const empty = createDomexNeuronDataFromLegacy({});
    expect(empty).toMatchObject({ parserVersion: null, objects: [], sections: {
      property: "not_found", household: "not_found", liability: "not_found", assistance: "not_found",
    } });
    const household = createDomexNeuronDataFromLegacy({ address: "Společná 1, Testov", householdType: "trvale", householdSumInsured: 600_000 });
    expect(household.objects).toHaveLength(1);
    expect(household.objects[0]).toMatchObject({ kind: "household", address: null });
    expect(normalizeDomexNeuronData(household)).toEqual(household);
  });

  it("retains an explicitly cleared address, known zero deductible and basic assistance", () => {
    const data = createDomexNeuronDataFromLegacy({ address: "Stará společná 2", propertyAddress: null,
      propertyType: "dum", deductible: 0, propertyAssistance: "basic" });
    expect(data.objects[0]).toMatchObject({ address: null, deductible: 0, assistance: "basic",
      fields: { address: "not_found", deductible: "found", assistance: "found" } });
  });

  it("keeps scalar aliases scoped to the first object and clears them after removal", () => {
    const data = domexNeuronDataFixture();
    expect(projectDomexNeuronLegacy(data)).toMatchObject({ propertyAddress: data.objects[0].address,
      sumInsured: 4_000_000, householdAddress: data.objects[2].address, householdSumInsured: 600_000 });
    expect(projectDomexNeuronLegacy({ ...data, objects: [] })).toMatchObject({ propertyAddress: null, sumInsured: null,
      householdAddress: null, householdSumInsured: null, assistancePlus: null });
  });

  it("migrates known legacy values to their matching address and adds the other PDF objects", () => {
    const pdf = domexNeuronDataFixture();
    const before = structuredClone(pdf);
    const result = mergeDomexNeuronPdfData(null, pdf, {
      propertyAddress: pdf.objects[1].address, propertyType: "byt", sumInsured: 2_600_000, propertyAssistance: "basic",
    });
    expect(result.data.objects).toHaveLength(3);
    expect(result.data.objects.find(object => object.address === pdf.objects[1].address)).toMatchObject({
      sumInsured: 2_600_000, assistance: "basic", coverage: "maxi",
    });
    expect(result.conflictKeys).toContain("objects.0.sumInsured");
    expect(pdf).toEqual(before);
    expect(normalizeDomexNeuronData(result.data)).toEqual(result.data);
  });

  it("matches reordered objects by address and fills the correct empty amount without overriding the other", () => {
    const saved = domexNeuronDataFixture();
    saved.objects[0].sumInsured = 9_000_000;
    saved.objects[1].sumInsured = null;
    saved.objects[1].fields.sumInsured = "unreadable";
    const pdf = domexNeuronDataFixture();
    pdf.objects.reverse();
    const before = structuredClone(saved);
    const result = mergeDomexNeuronPdfData(saved, pdf);
    expect(result.data.objects[0].sumInsured).toBe(9_000_000);
    expect(result.data.objects[1].sumInsured).toBe(2_500_000);
    expect(result.data.objects[1].fields.sumInsured).toBe("found");
    expect(saved).toEqual(before);
  });

  it("leaves ambiguous objects at the same address for review", () => {
    const saved = domexNeuronDataFixture();
    saved.objects[1].address = saved.objects[0].address;
    saved.objects[0].sumInsured = null;
    saved.objects[0].fields.sumInsured = "unreadable";
    const result = mergeDomexNeuronPdfData(saved, domexNeuronDataFixture());
    expect(result.data.objects[0].sumInsured).toBeNull();
    expect(result.conflictKeys).toContain("objects.property");
    expect(result.data.objects).toHaveLength(3);
  });

  it("does not resurrect a manually removed object during same-version reprocessing", () => {
    const pdf = domexNeuronDataFixture();
    const saved = { ...pdf, objects: pdf.objects.slice(1) };
    const result = mergeDomexNeuronPdfData(saved, pdf);
    expect(result.data.objects).toEqual(saved.objects);
    expect(result.appliedCount).toBe(0);
    expect(result.conflictKeys).toContain("objects.property");
  });

  it.each([null, 1, 2])("preserves removals even when reprocessing an older or manual model (%s)", parserVersion => {
    const pdf = domexNeuronDataFixture();
    const saved = { ...pdf, parserVersion, objects: [pdf.objects[0]] };
    const first = mergeDomexNeuronPdfData(saved, pdf);
    expect(first.data.objects).toHaveLength(1);
    expect(first.data.parserVersion).toBe(2);
    expect(first.conflictKeys).toEqual(["objects.household", "objects.property"]);
    expect(mergeDomexNeuronPdfData(first.data, pdf)).toEqual({ data: first.data, appliedCount: 0,
      conflictKeys: ["objects.household", "objects.property"] });
  });

  it("keeps explicit manual non-insurance instead of interpreting absence as permission to add coverage", () => {
    const saved = createDomexNeuronDataFromLegacy({});
    saved.sections.property = "not_insured";
    const result = mergeDomexNeuronPdfData(saved, domexNeuronDataFixture());
    expect(result.data.sections.property).toBe("not_insured");
    expect(result.data.objects.some(object => object.kind === "property")).toBe(false);
    expect(result.conflictKeys).toContain("objects.property");
  });

  it("does not assign a legacy object with an unknown address to one of multiple PDF candidates", () => {
    const result = mergeDomexNeuronPdfData(null, domexNeuronDataFixture(), { propertyType: "dum", sumInsured: 8_000_000 });
    expect(result.data.objects.filter(object => object.kind === "property")).toEqual([
      expect.objectContaining({ address: null, sumInsured: 8_000_000 }),
    ]);
    expect(result.conflictKeys).toContain("objects.property");
  });

  it("does not duplicate a legacy object whose full address differs from every multiobject PDF candidate", () => {
    const pdf = domexNeuronDataFixture();
    const result = mergeDomexNeuronPdfData(null, pdf, {
      propertyAddress: pdf.objects[0].address?.replace(",", ""), propertyType: "dum", sumInsured: 8_000_000,
    });
    expect(result.data.objects.filter(object => object.kind === "property")).toHaveLength(1);
    expect(result.data.objects[0].sumInsured).toBe(8_000_000);
    expect(result.conflictKeys).toContain("objects.property");
  });

  it("does not downgrade a known newer parser marker", () => {
    const saved = domexNeuronDataFixture({ objects: [domexNeuronObjectFixture()] });
    expect(mergeDomexNeuronPdfData(saved, { ...saved, parserVersion: 1 }).data.parserVersion).toBe(2);
  });
});
