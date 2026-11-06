import {
  DOMEX_NEURON_PARSER_VERSION,
  type DomexNeuronData,
  type DomexNeuronObject,
  type DomexNeuronObjectKind,
} from "../../src/app/lib/domexNeuronSchema";

export function domexNeuronObjectFixture(
  patch: Partial<DomexNeuronObject> = {},
  kind: DomexNeuronObjectKind = "property",
): DomexNeuronObject {
  return {
    id: `${kind}-1`, kind, type: kind === "property" ? "dum" : "trvale",
    address: kind === "property" ? "Testovací 11, Testov" : "Modelová 22, Testov",
    coverage: "opti", sumInsured: kind === "property" ? 4_000_000 : 600_000,
    deductible: 0, assistance: "basic",
    fields: { type: "found", address: "found", coverage: "found", sumInsured: "found", deductible: "found", assistance: "found" },
    ...patch,
  };
}

export function domexNeuronDataFixture(patch: Partial<DomexNeuronData> = {}): DomexNeuronData {
  return {
    parserVersion: DOMEX_NEURON_PARSER_VERSION,
    sections: { property: "found", household: "found", liability: "not_insured", assistance: "found" },
    objects: [
      domexNeuronObjectFixture(),
      domexNeuronObjectFixture({ id: "property-2", type: "byt", address: "Vzorová 33, Testov", coverage: "maxi", sumInsured: 2_500_000, assistance: "plus" }),
      domexNeuronObjectFixture({}, "household"),
    ],
    liabilityFields: { sumInsured: "not_insured", deductible: "not_insured" },
    ...patch,
  };
}
