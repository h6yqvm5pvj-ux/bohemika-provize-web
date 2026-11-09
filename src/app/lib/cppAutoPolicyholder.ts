import type {
  CppAutoContractIdentityItem,
  CppAutoContractIdentityLine,
  CppAutoContractIdentityPage,
} from "./cppAutoContractIdentity";

export type CppAutoPolicyholderItem = CppAutoContractIdentityItem;
export type CppAutoPolicyholderLine = CppAutoContractIdentityLine;
export type CppAutoPolicyholderPage = CppAutoContractIdentityPage;

export type CppAutoPolicyholder = {
  clientName: string | null;
  personalId: string | null;
  warnings: string[];
};

type Span = { start: number; end: number; left: number; right: number; y: number };
type Row = { text: string; folded: string; spans: Span[]; ambiguousName?: boolean };
type Role = { start: number; end: number; policyholder: boolean; box: Span | null; ambiguousName: boolean };
type FieldKind = "first" | "last" | "full" | "company" | "birthNumber" | "companyId" | "titleBefore" | "titleAfter" | "other";
type Label = { kind: FieldKind; start: number; end: number; box: Span | null };
type Scope = Row[];
type Values = { seen: boolean; invalid: boolean; values: Set<string> };
type Candidate = { name: string | null; nameIdentity: string | null; id: string | null; hasNameLabel: boolean; badId: boolean };

const MISSING_SECTION = "V PDF nebyla nalezena jednoznačná sekce pojistníka.";
const MISSING_NAME = "Jméno pojistníka není úplné nebo jednoznačně čitelné; zkontrolujte jej ručně.";
const CONFLICT = "PDF obsahuje rozporné údaje pojistníka; zkontrolujte je ručně.";
const INVALID_ID = "Identifikační číslo pojistníka není jednoznačně čitelné; zkontrolujte je ručně.";

const fold = (text: string): string => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const clean = (text: string): string => text.normalize("NFC").replace(/\s+/g, " ").trim();
const rolePattern = () => /\b(pojistnik|pojistena osoba|pojisteny|provozovatel|vlastnik|pojistovaci zprostredkovatel|zprostredkovatel|pojistovaci poradce|poradce|obchodni zastupce|makler|jednajici osoba|kontaktni osoba|opravnena osoba|zastupce|udaje o vozidle|vozidlo|predmet pojisteni|podpisy)\b/g;
const fieldPattern = () => /\b(jmeno\s+a\s+prijmeni|jmeno|prijmeni|nazev(?:\s+(?:firmy|spolecnosti))?|obchodni firma|rodne cislo|r\.?\s*c\.?|ico?|dic|titul pred|titul za|tital za|platce dph|datum narozeni|statni prislusnost|adresa|bydliste|telefon|mobil|e-mail|email|psc|obec|ulice|cislo popisne|cislo orientacni)\b\s*[:：]?/g;

function prepareRow(line: CppAutoPolicyholderLine): Row {
  const items = line.items.filter((item) => item.str.trim());
  if (!items.length || items.some((item) => ![item.x, item.y, item.width].every(Number.isFinite) || item.width <= 0)) {
    const text = clean(line.text);
    return { text, folded: fold(text), spans: [] };
  }
  const spans: Span[] = [];
  let text = "";
  let previousRight: number | null = null;
  for (const item of [...items].sort((a, b) => a.x - b.x)) {
    if (previousRight !== null && item.x - previousRight > 1.5) text += " ";
    const value = clean(item.str);
    const start = text.length;
    text += value;
    spans.push({ start, end: text.length, left: item.x, right: item.x + item.width, y: item.y });
    previousRight = item.x + item.width;
  }
  return { text, folded: fold(text), spans };
}

function bounds(row: Row, start: number, end: number): Span | null {
  const parts = row.spans.flatMap((span) => {
    const from = Math.max(start, span.start);
    const to = Math.min(end, span.end);
    if (from >= to) return [];
    const unit = (span.right - span.left) / (span.end - span.start);
    return [{ start: from, end: to, left: span.left + (from - span.start) * unit, right: span.left + (to - span.start) * unit, y: span.y }];
  });
  return parts.length ? {
    start, end,
    left: Math.min(...parts.map((part) => part.left)),
    right: Math.max(...parts.map((part) => part.right)),
    y: parts[0].y,
  } : null;
}

function rolesIn(row: Row): Role[] {
  return [...row.folded.matchAll(rolePattern())].flatMap((match) => {
    const start = match.index;
    const raw = row.text.slice(start, start + match[0].length);
    // A role in prose or in a field value is not a section heading. In
    // particular, later declarations beginning “Pojistník prohlašuje…” must
    // never reopen a box and collect a signatory or an adviser below them.
    const item = row.spans.find((span) => start === span.start);
    const itemTail = row.text.slice(start + match[0].length, item?.end ?? row.text.length).trim();
    const wholeRow = start === 0 && !row.text.slice(start + match[0].length).replace(/[:：]/g, "").trim();
    const standaloneItem = !!item && !itemTail.replace(/[:：]/g, "").trim() &&
      (raw === raw.toUpperCase() || match[0] !== "pojistnik");
    const compactTail = fold(row.text.slice(start + match[0].length)).replace(/^[\s:：|;-]+/, "");
    const compact = /^(?:jmeno|prijmeni|nazev|obchodni firma|titul pred|rodne cislo|ico?)\b/.test(compactTail);
    // CPP Auto labels the next block “Provozovatel/Držitel vozidla”. Treat that
    // complete phrase as a section heading even when PDF.js keeps it in one
    // title-case text item; otherwise the operator's repeated identity fields
    // are merged into the policyholder's box.
    const headingPrefix = row.folded.slice(0, start).trim();
    const vehicleOperatorTail = compactTail.replace(/^\/\s*/, "");
    const vehicleOperatorHeading = match[0] === "provozovatel" &&
      /^(?:[a-z]|\d{1,2})?\.?$/.test(headingPrefix) && /^(?:drzitel\s+)?vozidla\s*[:：.]?$/.test(vehicleOperatorTail);
    if (!wholeRow && !standaloneItem && !(compact && (start === 0 || raw === raw.toUpperCase())) && !vehicleOperatorHeading) return [];
    const box = bounds(row, start, start + match[0].length);
    const preceding = labelsIn(row).filter((label) => label.end <= start).at(-1);
    const nameField = preceding && ["first", "last", "full", "company"].includes(preceding.kind);
    const between = preceding ? row.text.slice(preceding.end, start).trim() : "";
    const adjacentValue = !box || !preceding?.box ||
      (box.left >= preceding.box.right - 3 && box.left - preceding.box.right <= 100);
    const previousItem = row.spans.filter((span) => span.end <= start).at(-1);
    const adjacentWord = box && previousItem && box.left >= previousItem.right - 3 && box.left - previousItem.right <= 16;
    const nextLabel = labelsIn(row).find((label) => label.start >= start + match[0].length);
    const followingValue = row.text.slice(start + match[0].length, nextLabel?.start ?? row.text.length).trim();
    const companyWord = preceding?.kind === "company" && /\p{L}/u.test(followingValue) && !rolePattern().test(fold(followingValue));
    if (nameField && ((!between && adjacentValue) || (between && adjacentWord && companyWord && !compact))) return [];
    // When a distant role could also be a company/name word, do not silently
    // turn the preceding fragment into a valid shortened client name.
    const ambiguousName = !!(nameField && between && box && preceding?.box && !compact);
    return [{ start, end: start + match[0].length, policyholder: match[0] === "pojistnik", box, ambiguousName }];
  });
}

function sliceRow(row: Row, start: number, end: number): Row {
  const text = row.text.slice(start, end);
  const spans = row.spans.flatMap((span) => {
    const part = bounds(row, Math.max(start, span.start), Math.min(end, span.end));
    return part ? [{ ...part, start: part.start - start, end: part.end - start }] : [];
  });
  return { text, folded: fold(text), spans, ambiguousName: row.ambiguousName };
}

function cropRow(row: Row, left: number, right: number): Row {
  const eligible = row.spans.filter((span) => span.left >= left - 5 && span.right <= right + 2);
  if (!eligible.length) return { text: "", folded: "", spans: [] };
  const start = eligible[0].start;
  const end = eligible[eligible.length - 1].end;
  // Never infer which words belong to which role inside an unseparated item.
  if (row.spans.some((span) => span.start >= start && span.end <= end && !eligible.includes(span))) {
    return { text: "", folded: "", spans: [] };
  }
  return sliceRow(row, start, end);
}

function policyholderScopes(rows: Row[]): Scope[] {
  const scopes: Scope[] = [];
  rows.forEach((headerRow, rowIndex) => {
    const headers = rolesIn(headerRow);
    headers.forEach((header, headerIndex) => {
      if (!header.policyholder) return;
      const next = headers[headerIndex + 1];
      let right = next?.box?.left ?? Infinity;
      let columns = headers.length > 1;
      const left = header.box?.left ?? -Infinity;
      const opening = sliceRow(headerRow, header.end, next?.start ?? headerRow.text.length);
      if (next?.ambiguousName) opening.ambiguousName = true;
      const scope = [opening];
      // Text-only adjacent columns cannot be assigned on later rows safely.
      if (!header.box && headers.length > 1) { scopes.push(scope); return; }
      for (let index = rowIndex + 1; index < rows.length; index++) {
        const row = rows[index];
        const roles = rolesIn(row);
        let stop = false;
        let ambiguousName = false;
        for (const role of roles) {
          if (!role.box || !header.box) { stop = true; break; }
          if (role.box.left < left - 5 || role.box.left >= right) continue;
          ambiguousName ||= role.ambiguousName;
          if (role.box.left <= left + 40) { stop = true; break; }
          right = Math.min(right, role.box.left);
          columns = true;
        }
        if (stop) break;
        if (columns && !row.spans.length) continue;
        const scopedRow = header.box && row.spans.length ? cropRow(row, left, right) : row;
        scope.push(ambiguousName ? { ...scopedRow, ambiguousName: true } : scopedRow);
      }
      scopes.push(scope);
    });
  });
  return scopes;
}

function labelsIn(row: Row): Label[] {
  const labelsOnly = !row.folded.replace(fieldPattern(), "").trim();
  return [...row.folded.matchAll(fieldPattern())].flatMap((match) => {
    const item = row.spans.find((span) => span.start === match.index);
    const entireItem = item && !row.text.slice(match.index + match[0].length, item.end).trim();
    // Bare words in an inline value remain part of that value, even when
    // PDF.js splits every company-name word into a separate text item.
    // Colon-free stacked label rows are safe because they contain no values.
    if (match.index !== 0 && !/[:：]$/.test(match[0].trim()) && !(entireItem && labelsOnly)) return [];
    const label = match[1];
    let kind: FieldKind = "other";
    if (label === "jmeno") kind = "first";
    else if (label === "prijmeni") kind = "last";
    else if (label === "jmeno a prijmeni") kind = "full";
    else if (label.startsWith("nazev") || label === "obchodni firma") kind = "company";
    else if (label === "rodne cislo" || /^r\.?\s*c\.?$/.test(label)) kind = "birthNumber";
    else if (/^ico?$/.test(label)) kind = "companyId";
    else if (label === "titul pred") kind = "titleBefore";
    else if (label === "titul za" || label === "tital za") kind = "titleAfter";
    return [{ kind, start: match.index, end: match.index + match[0].length, box: bounds(row, match.index, match.index + match[0].length) }];
  });
}

function fieldValue(rows: Scope, rowIndex: number, labels: Label[], labelIndex: number): string {
  const row = rows[rowIndex];
  const label = labels[labelIndex];
  const next = labels[labelIndex + 1];
  const raw = clean(row.text.slice(label.end, next?.start ?? row.text.length)).replace(/^[:：]\s*/, "");
  if (raw) {
    if (label.box) {
      const firstValueIndex = label.end + row.text.slice(label.end).search(/\S/);
      const box = bounds(row, firstValueIndex, next?.start ?? row.text.length);
      if (!box || box.left < label.box.right - 3 || box.left - label.box.right > 100) return "";
    }
    return raw;
  }
  const below = rows[rowIndex + 1];
  if (!below || labelsIn(below).length || rolesIn(below).length) return "";
  if (!label.box) return labels.length === 1 && !below.spans.length ? clean(below.text) : "";
  if (!below.spans.length || Math.abs(label.box.y - below.spans[0].y) > 36) return "";
  const right = next?.box?.left ?? Infinity;
  const items = below.spans.filter((span) => span.left >= label.box!.left - 5 && span.right <= right + 2);
  return items.map((span) => below.text.slice(span.start, span.end)).join(" ").trim();
}

const titleStart = /^(?:(?:ing|mgr|bc|bca|judr|mudr|mvdr|rndr|phdr|pharmdr|paeddr|thdr|dr|doc|prof)\.?\s+)+/i;
const titleEnd = /(?:,?\s+(?:ph\.?d|dis|mba|bba|msc|csc|drsc)\.?)+$/i;
const placeholder = (value: string): boolean => /^(?:neuveden[oaey]?|nevyplnen[oaey]?|neznam[oaey]?|nezjisteno|neni uvedeno|n\/a|null|none|ano|ne|-+)$/.test(fold(value));

const prefixTitleLabels = new Map([
  ["ing", "Ing."], ["arch", "arch."], ["mgr", "Mgr."], ["art", "art."],
  ["bc", "Bc."], ["bca", "BcA."], ["judr", "JUDr."], ["mudr", "MUDr."],
  ["mvdr", "MVDr."], ["rndr", "RNDr."], ["phdr", "PhDr."], ["pharmdr", "PharmDr."],
  ["paeddr", "PaedDr."], ["thdr", "ThDr."], ["dr", "Dr."], ["doc", "doc."],
  ["prof", "prof."], ["dipl", "dipl."],
]);
const suffixTitleLabels = new Map([
  ["phd", "Ph.D."], ["dis", "DiS."], ["mba", "MBA"], ["bba", "BBA"],
  ["msc", "MSc."], ["csc", "CSc."], ["drsc", "DrSc."], ["thd", "Th.D."],
  ["llm", "LL.M."], ["mph", "MPH"],
]);

function canonicalizeTitle(value: string, position: "before" | "after"): string | null {
  const tokens = clean(value).replace(/[,;]/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 4) return null;
  const labels = position === "before" ? prefixTitleLabels : suffixTitleLabels;
  const canonical = tokens.map((token) =>
    labels.get(fold(token).replace(/[^a-z0-9]/g, ""))
  );
  return canonical.every((token): token is string => Boolean(token)) ? canonical.join(" ") : null;
}

function personPart(value: string): string | null {
  let name = clean(value);
  for (let index = 0; index < 3; index++) name = name.replace(titleStart, "").replace(titleEnd, "").trim();
  if (!name || name.length > 100 || placeholder(name)) return null;
  return /^[\p{L}\p{M}][\p{L}\p{M}'’ .-]*$/u.test(name) && name.split(/\s+/).length <= 6 ? name : null;
}

function readField(kind: FieldKind, value: string): string | null {
  if (kind === "titleBefore") return canonicalizeTitle(value, "before");
  if (kind === "titleAfter") return canonicalizeTitle(value, "after");
  if (kind === "first" || kind === "last" || kind === "full") {
    const name = personPart(value);
    return kind !== "full" || (name && name.split(/\s+/).length >= 2) ? name : null;
  }
  if (kind === "company") {
    const company = clean(value).replace(/^[,;:]+|[,;:]+$/g, "").trim();
    const unseparatedIdentifier = /\b(?:ico?|dic|rodne cislo|r\.?\s*c\.?|telefon|mobil)\s+(?:cz)?\+?\d/i.test(fold(company));
    return company.length >= 3 && company.length <= 200 && !placeholder(company) && !unseparatedIdentifier &&
      /\p{L}/u.test(company) && !/[\p{Cc}\p{Cf}@]/u.test(company) ? company : null;
  }
  if (kind === "companyId") return /^\d(?:\s*\d){7}$/.test(value) ? value.replace(/\s/g, "") : null;
  if (kind === "birthNumber") {
    const digits = value.replace(/\s/g, "");
    const match = /^(\d{6})\/?(\d{3,4})$/.exec(digits);
    return match ? `${match[1]}/${match[2]}` : null;
  }
  return null;
}

function candidateFrom(rows: Scope): Candidate {
  const fields: Record<Exclude<FieldKind, "other">, Values> = {
    first: { seen: false, invalid: false, values: new Set() },
    last: { seen: false, invalid: false, values: new Set() },
    full: { seen: false, invalid: false, values: new Set() },
    company: { seen: false, invalid: false, values: new Set() },
    birthNumber: { seen: false, invalid: false, values: new Set() },
    companyId: { seen: false, invalid: false, values: new Set() },
    titleBefore: { seen: false, invalid: false, values: new Set() },
    titleAfter: { seen: false, invalid: false, values: new Set() },
  };
  rows.forEach((row, rowIndex) => {
    const labels = labelsIn(row);
    labels.forEach((label, labelIndex) => {
      if (label.kind === "other") return;
      const field = fields[label.kind];
      field.seen = true;
      const raw = fieldValue(rows, rowIndex, labels, labelIndex);
      const value = readField(label.kind, raw);
      if (value) field.values.add(value);
      else if (raw) field.invalid = true;
    });
  });
  const unique = (field: Values): string | null => !field.invalid && field.values.size === 1 ? [...field.values][0] : null;
  let name: string | null = null;
  if (fields.company.seen) name = unique(fields.company);
  else {
    const first = unique(fields.first);
    const last = unique(fields.last);
    const full = unique(fields.full);
    if (first && last) name = `${first} ${last}`;
    if (full) name = name && fold(name) !== fold(full) ? null : full;
    if ([fields.first, fields.last, fields.full].some((field) => field.invalid || field.values.size > 1)) name = null;
  }
  if (rows.some((row) => row.ambiguousName)) name = null;
  const nameIdentity = name;
  if (name && !fields.company.seen) {
    const titleBefore = unique(fields.titleBefore);
    const titleAfter = unique(fields.titleAfter);
    if (titleBefore) name = `${titleBefore} ${name}`;
    if (titleAfter) name = `${name}, ${titleAfter}`;
  }
  const idField = fields.company.seen ? fields.companyId : fields.birthNumber.seen ? fields.birthNumber : fields.companyId;
  return {
    name,
    nameIdentity,
    id: unique(idField),
    hasNameLabel: fields.company.seen || fields.first.seen || fields.last.seen || fields.full.seen,
    badId: idField.seen && (idField.invalid || idField.values.size !== 1),
  };
}

/** Read the policyholder box only. Roles, pages, and columns are boundaries;
 * warnings never contain PDF values or identifying information. */
export function resolveCppAutoPolicyholder(pages: readonly CppAutoPolicyholderPage[]): CppAutoPolicyholder {
  const candidates = pages.flatMap((page) => policyholderScopes(page.map(prepareRow)).map(candidateFrom));
  if (!candidates.length) return { clientName: null, personalId: null, warnings: [MISSING_SECTION] };
  const relevant = candidates.filter((candidate) => candidate.hasNameLabel || candidate.id || candidate.badId);
  const names = new Map<string, string>();
  const ids = new Set<string>();
  for (const candidate of relevant) {
    if (candidate.name && candidate.nameIdentity) {
      const identity = fold(candidate.nameIdentity);
      const existing = names.get(identity);
      if (!existing || candidate.name.length > existing.length) names.set(identity, candidate.name);
    }
    if (candidate.id) ids.add(candidate.id);
  }
  const nameConflict = names.size > 1 || relevant.some((candidate) => candidate.hasNameLabel && !candidate.name);
  const idConflict = ids.size > 1 || relevant.some((candidate) => candidate.badId);
  const clientName = !nameConflict && names.size === 1 ? [...names.values()][0] : null;
  const personalId = !idConflict && ids.size === 1 ? [...ids][0] : null;
  const warnings: string[] = [];
  if (!clientName) warnings.push(names.size > 1 ? CONFLICT : MISSING_NAME);
  if (idConflict) warnings.push(ids.size > 1 ? CONFLICT : INVALID_ID);
  return { clientName, personalId, warnings: [...new Set(warnings)] };
}

/** Flatten only the same scoped boxes for the shared, name-checked email reader.
 * Synthetic boundary labels prevent it from joining two independent boxes. */
export function extractCppAutoPolicyholderLines(pages: readonly CppAutoPolicyholderPage[]): string[] {
  return pages.flatMap((page) => policyholderScopes(page.map(prepareRow)).flatMap((scope) => [
    "POJISTNÍK", ...scope.map((row) => row.text).filter((value) => value.trim()), "PODPISY",
  ]));
}
