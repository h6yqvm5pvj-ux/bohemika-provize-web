export const DOMEX_NEURON_PARSER_VERSION = 2;
export const DOMEX_NEURON_MAX_OBJECTS = 50;
export const DOMEX_EXTRACTION_STATUSES = ["found", "not_insured", "not_found", "unreadable"] as const;
export const DOMEX_NEURON_OBJECT_FIELDS = ["type", "address", "coverage", "sumInsured", "deductible", "assistance"] as const;

export type DomexExtractionStatus = typeof DOMEX_EXTRACTION_STATUSES[number];
export type DomexNeuronObjectKind = "property" | "household";
export type DomexNeuronCoverage = "mini" | "opti" | "maxi" | "nop";
export type DomexNeuronAssistance = "basic" | "plus";
export type DomexNeuronObject = {
  id: string;
  kind: DomexNeuronObjectKind;
  type: string | null;
  address: string | null;
  coverage: DomexNeuronCoverage | null;
  sumInsured: number | null;
  deductible: number | null;
  assistance: DomexNeuronAssistance | null;
  fields: Record<typeof DOMEX_NEURON_OBJECT_FIELDS[number], DomexExtractionStatus>;
};

export type DomexNeuronData = {
  parserVersion: number | null;
  sections: Record<"property" | "household" | "liability" | "assistance", DomexExtractionStatus>;
  objects: DomexNeuronObject[];
  liabilityFields: Record<"sumInsured" | "deductible", DomexExtractionStatus>;
};
