import {
  DOMEX_NEURON_MAX_OBJECTS,
  DOMEX_NEURON_OBJECT_FIELDS,
  type DomexExtractionStatus,
  type DomexNeuronData,
  type DomexNeuronObject,
  type DomexNeuronObjectKind,
} from "./domexNeuronSchema";

type LegacyDetail = {
  address?: string | null;
  propertyAddress?: string | null;
  householdAddress?: string | null;
  propertyType?: string | null;
  householdType?: string | null;
  propertyCoverage?: string | null;
  householdCoverage?: string | null;
  sumInsured?: number | null;
  householdSumInsured?: number | null;
  deductible?: number | null;
  householdDeductible?: number | null;
  propertyAssistance?: "basic" | "plus" | null;
  householdAssistance?: "basic" | "plus" | null;
  liabilitySumInsured?: number | null;
  liabilityDeductible?: number | null;
};

const present = (value: unknown) => value != null && (typeof value !== "string" || value.trim() !== "");
const status = (value: unknown): DomexExtractionStatus => present(value) ? "found" : "not_found";
const addressKey = (value: string | null) => value?.normalize("NFC").trim().toLocaleLowerCase("cs").replace(/\s+/g, " ") || null;
const knownStatus = (value: DomexExtractionStatus) => value === "found" || value === "not_insured";
const copyObject = (object: DomexNeuronObject): DomexNeuronObject => ({ ...object, fields: { ...object.fields } });

/** A manual edit of a legacy policy has no evidence of a parser version. */
export function createDomexNeuronDataFromLegacy(detail: LegacyDetail | null | undefined): DomexNeuronData {
  const source = detail ?? {};
  const objects: DomexNeuronObject[] = [];
  for (const kind of ["property", "household"] as const) {
    const property = kind === "property";
    const rawCoverage = property ? source.propertyCoverage : source.householdCoverage;
    const hasPropertyEvidence = [source.propertyType, source.propertyCoverage, source.sumInsured, source.deductible,
      source.propertyAssistance].some(present);
    const coverage = rawCoverage === "mini" || rawCoverage === "opti" || rawCoverage === "maxi" || rawCoverage === "nop" ? rawCoverage : null;
    const object: DomexNeuronObject = {
      id: `${kind}-1`, kind,
      type: (property ? source.propertyType : source.householdType)?.trim() || null,
      address: (property
        ? source.propertyAddress === undefined ? hasPropertyEvidence ? source.address : null : source.propertyAddress
        : source.householdAddress)?.trim() || null,
      coverage,
      sumInsured: (property ? source.sumInsured : source.householdSumInsured) ?? null,
      deductible: (property ? source.deductible : source.householdDeductible) ?? null,
      assistance: (property ? source.propertyAssistance : source.householdAssistance) ?? null,
      fields: { type: "not_found", address: "not_found", coverage: "not_found", sumInsured: "not_found", deductible: "not_found", assistance: "not_found" },
    };
    for (const field of DOMEX_NEURON_OBJECT_FIELDS) object.fields[field] = status(object[field]);
    if (DOMEX_NEURON_OBJECT_FIELDS.some(field => present(object[field]))) objects.push(object);
  }
  return {
    parserVersion: null,
    sections: {
      property: objects.some(object => object.kind === "property") ? "found" : "not_found",
      household: objects.some(object => object.kind === "household") ? "found" : "not_found",
      liability: present(source.liabilitySumInsured) || present(source.liabilityDeductible) ? "found" : "not_found",
      assistance: objects.some(object => object.assistance != null) ? "found" : "not_found",
    },
    objects,
    liabilityFields: { sumInsured: status(source.liabilitySumInsured), deductible: status(source.liabilityDeductible) },
  };
}

/** Scalars remain compatibility aliases of the first object of each kind. */
export function projectDomexNeuronLegacy(data: DomexNeuronData) {
  const property = data.objects.find(object => object.kind === "property");
  const household = data.objects.find(object => object.kind === "household");
  return {
    address: property?.address ?? household?.address ?? null,
    propertyAddress: property?.address ?? null,
    propertyType: property?.type ?? null,
    propertyCoverage: property?.coverage ?? null,
    sumInsured: property?.sumInsured ?? null,
    deductible: property?.deductible ?? null,
    propertyAssistance: property?.assistance ?? null,
    householdAddress: household?.address ?? null,
    householdType: household?.type ?? null,
    householdCoverage: household?.coverage ?? null,
    householdSumInsured: household?.sumInsured ?? null,
    householdDeductible: household?.deductible ?? null,
    householdAssistance: household?.assistance ?? null,
    assistancePlus: data.objects.some(object => object.assistance === "plus") ? true
      : data.objects.some(object => object.assistance === "basic") ? false : null,
  };
}

/** Match by kind and full address, never by an object's PDF order. A singleton
 * can retain its manual address; multiple ambiguous candidates need review. */
export function mergeDomexNeuronPdfData(
  current: DomexNeuronData | null | undefined,
  incoming: DomexNeuronData,
  legacy?: LegacyDetail | null,
): { data: DomexNeuronData; appliedCount: number; conflictKeys: string[] } {
  const baseline = current ?? createDomexNeuronDataFromLegacy(legacy);
  const data: DomexNeuronData = { ...baseline, objects: baseline.objects.map(copyObject),
    sections: { ...baseline.sections }, liabilityFields: { ...baseline.liabilityFields } };
  const conflicts = new Set<string>();
  const allowNewObjects = current == null;
  let appliedCount = current == null ? 1 : 0;
  for (const candidate of incoming.objects) {
    if (current != null && baseline.sections[candidate.kind] === "not_insured") {
      conflicts.add(`objects.${candidate.kind}`);
      continue;
    }
    const existingKind = baseline.objects.filter(object => object.kind === candidate.kind);
    const incomingKind = incoming.objects.filter(object => object.kind === candidate.kind);
    const key = addressKey(candidate.address);
    const matches = key ? existingKind.filter(object => addressKey(object.address) === key) : [];
    const uniqueIncoming = key && incomingKind.filter(object => addressKey(object.address) === key).length === 1;
    const target = matches.length === 1 && uniqueIncoming ? data.objects.find(object => object.id === matches[0].id)
      : existingKind.length === 1 && incomingKind.length === 1 ? data.objects.find(object => object.id === existingKind[0].id) : null;
    if (target) {
      for (const field of DOMEX_NEURON_OBJECT_FIELDS) {
        if (present(target[field])) {
          if ((present(candidate[field]) && target[field] !== candidate[field]) || candidate.fields[field] === "not_insured") {
            conflicts.add(`objects.${data.objects.indexOf(target)}.${field}`);
          }
          continue;
        }
        if (target.fields[field] === "not_insured") {
          if (present(candidate[field])) conflicts.add(`objects.${data.objects.indexOf(target)}.${field}`);
          continue;
        }
        if (present(candidate[field])) {
          // The field names have different value types, but the same name is
          // copied on both sides and the input was normalized before merging.
          Object.assign(target, { [field]: candidate[field] });
          target.fields[field] = candidate.fields[field];
          appliedCount++;
        } else if (!knownStatus(target.fields[field]) && candidate.fields[field] !== target.fields[field]) {
          target.fields[field] = candidate.fields[field];
          appliedCount++;
        }
      }
      continue;
    }
    const knownObjectsMatched = existingKind.every(object => {
      const existingKey = addressKey(object.address);
      return existingKey != null && existingKind.filter(item => addressKey(item.address) === existingKey).length === 1 &&
        incomingKind.filter(item => addressKey(item.address) === existingKey).length === 1;
    });
    const ambiguous = matches.length > 0 || (existingKind.length > 0 &&
      (!key || !uniqueIncoming || !knownObjectsMatched));
    // An existing canonical model may contain deliberate manual removals.
    // A parser upgrade cannot distinguish those from an older extraction miss.
    if (!allowNewObjects || ambiguous || data.objects.length >= DOMEX_NEURON_MAX_OBJECTS) {
      conflicts.add(`objects.${candidate.kind}`);
      continue;
    }
    data.objects.push({ ...copyObject(candidate), id: nextDomexNeuronObjectId(data.objects, candidate.kind) });
    appliedCount++;
  }
  for (const section of Object.keys(data.sections) as Array<keyof DomexNeuronData["sections"]>) {
    if (knownStatus(data.sections[section])) {
      if (knownStatus(incoming.sections[section]) && data.sections[section] !== incoming.sections[section]) conflicts.add(`sections.${section}`);
      continue;
    }
    if (data.sections[section] !== incoming.sections[section]) {
      data.sections[section] = incoming.sections[section];
      appliedCount++;
    }
  }
  for (const field of ["sumInsured", "deductible"] as const) {
    if (knownStatus(data.liabilityFields[field]) && knownStatus(incoming.liabilityFields[field]) &&
      data.liabilityFields[field] !== incoming.liabilityFields[field]) conflicts.add(`liabilityFields.${field}`);
    if (!knownStatus(data.liabilityFields[field]) && data.liabilityFields[field] !== incoming.liabilityFields[field]) {
      data.liabilityFields[field] = incoming.liabilityFields[field];
      appliedCount++;
    }
  }
  if (incoming.parserVersion != null && (data.parserVersion == null || incoming.parserVersion > data.parserVersion)) {
    data.parserVersion = incoming.parserVersion;
    appliedCount++;
  }
  return { data, appliedCount, conflictKeys: [...conflicts].sort() };
}

export function nextDomexNeuronObjectId(objects: DomexNeuronObject[], kind: DomexNeuronObjectKind): string {
  let index = 1;
  const ids = new Set(objects.map(object => object.id));
  while (ids.has(`${kind}-${index}`)) index++;
  return `${kind}-${index}`;
}
