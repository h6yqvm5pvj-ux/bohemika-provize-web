import {
  DOMEX_EXTRACTION_STATUSES,
  DOMEX_NEURON_MAX_OBJECTS,
  DOMEX_NEURON_OBJECT_FIELDS,
  DOMEX_NEURON_PARSER_VERSION,
  type DomexExtractionStatus,
  type DomexNeuronData,
  type DomexNeuronObject,
} from "./domexNeuronSchema";

const SECTION_KEYS = ["property", "household", "liability", "assistance"] as const;
const LIABILITY_KEYS = ["sumInsured", "deductible"] as const;
const OBJECT_KEYS = ["id", "kind", ...DOMEX_NEURON_OBJECT_FIELDS, "fields"] as const;
const INVALID = Symbol("invalid-domex-neuron-value");

const record = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function statuses<Keys extends readonly string[]>(value: unknown, keys: Keys): Record<Keys[number], DomexExtractionStatus> | null {
  if (!record(value) || !exactKeys(value, keys) ||
    !keys.every(key => DOMEX_EXTRACTION_STATUSES.some(status => status === value[key]))) return null;
  return Object.fromEntries(keys.map(key => [key, value[key]])) as Record<Keys[number], DomexExtractionStatus>;
}

function text(value: unknown): string | null | typeof INVALID {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) return INVALID;
  return value.trim() || null;
}

function amount(value: unknown): number | null | typeof INVALID {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000 ? value : INVALID;
}

function choice<Options extends readonly string[]>(value: unknown, options: Options): Options[number] | null | typeof INVALID {
  if (value === null) return null;
  return options.some(option => option === value) ? value as Options[number] : INVALID;
}

/** A bounded shared model normalizer. Invalid and future schemas fail closed;
 * callers distinguish an explicit nullable field before invoking this helper. */
export function normalizeDomexNeuronData(value: unknown): DomexNeuronData | null {
  if (!record(value) || !exactKeys(value, ["parserVersion", "sections", "objects", "liabilityFields"])) return null;
  const parserVersion = value.parserVersion;
  if (parserVersion !== null && (typeof parserVersion !== "number" || !Number.isSafeInteger(parserVersion) ||
    parserVersion < 1 || parserVersion > DOMEX_NEURON_PARSER_VERSION)) return null;
  const sections = statuses(value.sections, SECTION_KEYS);
  const liabilityFields = statuses(value.liabilityFields, LIABILITY_KEYS);
  if (!sections || !liabilityFields || !Array.isArray(value.objects) || value.objects.length > DOMEX_NEURON_MAX_OBJECTS) return null;
  const objects: DomexNeuronObject[] = [];
  const ids = new Set<string>();
  for (const raw of value.objects) {
    if (!record(raw) || !exactKeys(raw, OBJECT_KEYS) || typeof raw.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(raw.id) || ids.has(raw.id) ||
      (raw.kind !== "property" && raw.kind !== "household")) return null;
    const fields = statuses(raw.fields, DOMEX_NEURON_OBJECT_FIELDS);
    const type = text(raw.type), address = text(raw.address);
    const coverage = choice(raw.coverage, ["mini", "opti", "maxi", "nop"] as const);
    const assistance = choice(raw.assistance, ["basic", "plus"] as const);
    const sumInsured = amount(raw.sumInsured), deductible = amount(raw.deductible);
    if (!fields || type === INVALID || address === INVALID || coverage === INVALID || assistance === INVALID ||
      sumInsured === INVALID || deductible === INVALID) return null;
    ids.add(raw.id);
    objects.push({ id: raw.id, kind: raw.kind, type, address, coverage, sumInsured, deductible, assistance, fields });
  }
  return { parserVersion, sections, objects, liabilityFields };
}
