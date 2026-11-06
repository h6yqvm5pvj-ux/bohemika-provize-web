import { describe, expect, it } from "vitest";
import { domexNeuronDataFixture, domexNeuronObjectFixture } from "../../../tests/helpers/domexNeuronFixture";
import { DOMEX_NEURON_PARSER_VERSION } from "./domexNeuronSchema";
import { normalizeDomexNeuronData } from "./domexNeuronValidation";

describe("bounded DOMEX Neuron data normalization", () => {
  it("preserves separate objects, zeroes and extraction states without mutating the input", () => {
    const source = domexNeuronDataFixture();
    const before = structuredClone(source);
    const result = normalizeDomexNeuronData(source);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result?.objects[0].deductible).toBe(0);
    expect(result?.objects[0]).not.toBe(source.objects[0]);
    expect(source).toEqual(before);
  });

  it.each([null, 1, DOMEX_NEURON_PARSER_VERSION])("accepts manual/known parser version %j", parserVersion => {
    expect(normalizeDomexNeuronData(domexNeuronDataFixture({ parserVersion }))?.parserVersion).toBe(parserVersion);
  });

  it.each([undefined, 0, -1, 1.5, DOMEX_NEURON_PARSER_VERSION + 1, "2", true, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid or unknown future parser version %j", parserVersion => {
      expect(normalizeDomexNeuronData({ ...domexNeuronDataFixture(), parserVersion })).toBeNull();
    },
  );

  it("accepts 50 unique objects and rejects 51 or duplicate IDs", () => {
    const objects = Array.from({ length: 50 }, (_, index) => domexNeuronObjectFixture({ id: `property-${index + 1}` }));
    expect(normalizeDomexNeuronData(domexNeuronDataFixture({ objects }))?.objects).toHaveLength(50);
    expect(normalizeDomexNeuronData(domexNeuronDataFixture({ objects: [...objects, domexNeuronObjectFixture({ id: "property-51" })] }))).toBeNull();
    expect(normalizeDomexNeuronData(domexNeuronDataFixture({ objects: [objects[0], objects[0]] }))).toBeNull();
  });

  it("accepts UUID IDs and an empty manual object without inventing values", () => {
    const object = domexNeuronObjectFixture({ id: "1745ea0e-a2e2-45e3-a112-292306a131d1", type: null, address: null,
      coverage: null, sumInsured: null, deductible: null, assistance: null,
      fields: { type: "not_found", address: "unreadable", coverage: "not_found", sumInsured: "not_found", deductible: "not_found", assistance: "not_insured" },
    });
    expect(normalizeDomexNeuronData(domexNeuronDataFixture({ parserVersion: null, objects: [object] }))?.objects).toEqual([object]);
  });

  it("trims bounded text and preserves explicit nulls", () => {
    const result = normalizeDomexNeuronData(domexNeuronDataFixture({ objects: [domexNeuronObjectFixture({ type: " ", address: "  Testovací 1  ", assistance: null })] }));
    expect(result?.objects[0]).toMatchObject({ type: null, address: "Testovací 1", assistance: null });
  });

  it.each([
    ["unsafe ID", { id: "../property-1" }], ["oversized ID", { id: "x".repeat(65) }], ["empty ID", { id: "" }],
    ["unknown kind", { kind: "liability" }], ["unknown coverage", { coverage: "vip" }], ["wrong assistance type", { assistance: true }],
    ["wrong text type", { address: {} }], ["oversized text", { type: "x".repeat(201) }], ["text control", { address: "Test\u0000ov" }],
    ["number coercion", { sumInsured: "100000" }], ["negative amount", { sumInsured: -1 }], ["oversized amount", { sumInsured: 1_000_000_001 }],
    ["infinite amount", { deductible: Number.POSITIVE_INFINITY }], ["boolean amount", { deductible: false }],
    ["unknown object key", { privateData: { payload: "synthetic" } }], ["missing statuses", { fields: {} }],
    ["hostile status", { fields: { ...domexNeuronObjectFixture().fields, address: { status: "found" } } }],
  ])("rejects %s", (_name, patch) => {
    expect(normalizeDomexNeuronData({ ...domexNeuronDataFixture(), objects: [{ ...domexNeuronObjectFixture(), ...patch }] })).toBeNull();
  });

  it.each([
    ["unknown model key", { extra: "value" }], ["invalid objects", { objects: {} }], ["missing section states", { sections: {} }],
    ["unknown section key", { sections: { ...domexNeuronDataFixture().sections, basement: "found" } }],
    ["unknown status", { sections: { ...domexNeuronDataFixture().sections, household: "missing" } }],
    ["invalid liability states", { liabilityFields: { sumInsured: "found", deductible: true } }],
  ])("rejects %s", (_name, patch) => {
    expect(normalizeDomexNeuronData({ ...domexNeuronDataFixture(), ...patch })).toBeNull();
  });

  it("rejects omitted object keys and non-plain nested objects", () => {
    const object = domexNeuronObjectFixture();
    const missingAddress: Record<string, unknown> = { ...object };
    delete missingAddress.address;
    expect(normalizeDomexNeuronData({ ...domexNeuronDataFixture(), objects: [missingAddress] })).toBeNull();
    expect(normalizeDomexNeuronData(Object.assign(Object.create({ inherited: true }), domexNeuronDataFixture()))).toBeNull();
    expect(normalizeDomexNeuronData({ ...domexNeuronDataFixture(), objects: [Object.assign(new Date(), object)] })).toBeNull();
    expect(normalizeDomexNeuronData({ ...domexNeuronDataFixture(), ...JSON.parse('{"__proto__":{"polluted":true}}') })).toBeNull();
  });
});
