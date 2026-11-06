export type CppAutoDates = {
  policyStartDate: string | null;
  contractSignedDate: string | null;
  warnings: string[];
};

type DateField = "start" | "prepared" | "presented" | "print";
type DateCandidate = { field: DateField; value: string | null };

const LABELS: ReadonlyArray<{ field: DateField; pattern: RegExp }> = [
  { field: "start", pattern: /\bpocatek\s+pojisteni\b *:? */g },
  {
    field: "prepared",
    pattern: /\bnavrh\s+pojistne\s+smlouvy\s+vyhotoven\s+dne\b *:? */g,
  },
  {
    field: "presented",
    pattern: /\bnavrh\s+pojistne\s+smlouvy\s+predlozen\s+dne\b *:? */g,
  },
  { field: "print", pattern: /\btisk\s+sus\s+plus\b *[:,]? */g },
];

const WARNINGS: Record<DateField, { invalid: string; conflict: string }> = {
  start: {
    invalid: "ČPP Auto: Počátek pojištění obsahuje neplatné nebo neúplné datum.",
    conflict: "ČPP Auto: Počátek pojištění má více rozdílných dat.",
  },
  prepared: {
    invalid: "ČPP Auto: Datum návrhu pojistné smlouvy je neplatné nebo neúplné.",
    conflict: "ČPP Auto: Návrh pojistné smlouvy má více rozdílných dat.",
  },
  presented: {
    invalid: "ČPP Auto: Datum návrhu pojistné smlouvy je neplatné nebo neúplné.",
    conflict: "ČPP Auto: Návrh pojistné smlouvy má více rozdílných dat.",
  },
  print: {
    invalid: "ČPP Auto: Datum Tisk SUS Plus je neplatné nebo neúplné.",
    conflict: "ČPP Auto: Tisk SUS Plus má více rozdílných dat.",
  },
};

const normalizeLine = (line: string): string =>
  line.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

const DATE_PREFIX = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})(?!\d)/;
const DATE_ONLY = /^\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*\d{4}(?:\s+(?:v\s+)?\d{1,2}:\d{2}(?::\d{2})?(?:\s+hod(?:in)?\.?)?)?\s*$/;

const calendarDate = (value: string): string | null => {
  const match = value.match(DATE_PREFIX);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const resolveCandidates = (
  candidates: readonly DateCandidate[],
  field: DateField,
  warnings: string[],
): string | null => {
  const matching = candidates.filter((candidate) => candidate.field === field);
  if (!matching.length) return null;
  if (matching.some((candidate) => candidate.value === null)) {
    warnings.push(WARNINGS[field].invalid);
    return null;
  }
  const values = new Set(matching.map((candidate) => candidate.value));
  if (values.size > 1) {
    warnings.push(WARNINGS[field].conflict);
    return null;
  }
  return matching[0].value;
};

/** Read only explicitly labelled dates; never cross a page or another field to find a value. */
export function resolveCppAutoDates(pages: readonly (readonly string[])[]): CppAutoDates {
  const candidates: DateCandidate[] = [];
  for (const page of pages) {
    // Whitespace inside the exact label may span visual rows, as in the legacy
    // parser. Keep line endings after it so only an immediate date-only row can supply a value.
    const text = page.map(normalizeLine).filter(Boolean).join("\n");
    for (const { field, pattern } of LABELS) {
      for (const match of text.matchAll(pattern)) {
        const [inlineValue = "", nextLine = ""] = text.slice(match.index + match[0].length).split("\n", 2);
        const value = inlineValue.trim() || (DATE_ONLY.test(nextLine) ? nextLine : "");
        candidates.push({ field, value: calendarDate(value) });
      }
    }
  }

  const warnings: string[] = [];
  const policyStartDate = resolveCandidates(candidates, "start", warnings);
  // A present primary label blocks every fallback even when its value is invalid or missing.
  const signedField = candidates.some((candidate) => candidate.field === "prepared") ? "prepared"
    : candidates.some((candidate) => candidate.field === "presented") ? "presented" : "print";
  const contractSignedDate = resolveCandidates(candidates, signedField, warnings);
  return { policyStartDate, contractSignedDate, warnings };
}
