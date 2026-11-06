import {
  DOMEX_NEURON_MAX_OBJECTS, DOMEX_NEURON_OBJECT_FIELDS, DOMEX_NEURON_PARSER_VERSION,
  type DomexExtractionStatus, type DomexNeuronAssistance, type DomexNeuronCoverage,
  type DomexNeuronData, type DomexNeuronObject, type DomexNeuronObjectKind,
} from "./domexNeuronSchema";

export type DomexPropertyLayoutLine = {
  text: string;
  items: { str: string; x: number; y: number; width: number }[];
};

export type DomexNeuronPropertyFields = {
  domexNeuron?: DomexNeuronData;
  domexPropertyAddress?: string | null;
  domexHouseholdAddress?: string | null;
  domexPropertyAssistance?: "basic" | "plus" | null;
  domexHouseholdAssistance?: "basic" | "plus" | null;
};

type Kind = "property" | "household" | "liability" | "assistance" | "other";
type Line = DomexPropertyLayoutLine & { normalized: string; page: number };
type Section = { kind: Kind; lines: Line[] };
type Reading<T> = { value: T | null; status: DomexExtractionStatus };
const missing = <T,>(): Reading<T> => ({ value: null, status: "not_found" });
const unreadable = <T,>(): Reading<T> => ({ value: null, status: "unreadable" });
const notInsured = (value: string) => /^(?:nesjednano|nepojisteno)\b/.test(normalize(value));
const safeText = (value: string | null) => value && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLowerCase().replace(/\s+/g, " ").trim();
const headingKind = (value: string): Kind | null => {
  const suffix = "(?:\\s*[:–—-]?\\s*(?:nesjednano|nepojisteno))?\\s*:?$";
  if (new RegExp("^pojisteni\\s+staveb" + suffix).test(value)) return "property";
  if (new RegExp("^pojisteni\\s+domacnosti" + suffix).test(value)) return "household";
  if (new RegExp("^pojisteni\\s+odpovednosti(?:\\s+obcana\\s+v\\s+beznem\\s+obcanskem\\s+zivote)?" + suffix).test(value)) return "liability";
  if (new RegExp("^asistencni\\s+sluzby" + suffix).test(value)) return "assistance";
  if (/^(?:spolecna\s+ustanoveni|prohlaseni\s+pojistnika|doplnkova\s+pojisteni|vedlejsi\s+stavb[ay])\b/.test(value)) return "other";
  if (/^hlavni\s+stavba\b/.test(value)) return "property";
  if (/^domacnost\b/.test(value)) return "household";
  return null;
};

const amountFrom = (value: string): number | null => {
  const match = value.trim().match(/^((?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*(?:Kč|CZK)(?=$|\s|[.,;])/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null;
};

function amountAtLabel(lines: Line[], index: number, label: RegExp): Reading<number> {
  const text = lines[index].text.replace(label, "");
  if (notInsured(text)) return { value: null, status: "not_insured" };
  const inline = amountFrom(text);
  if (inline !== null) return { value: inline, status: "found" };
  if (text.trim()) return unreadable();
  // A split value must remain adjacent to its label, within the same section.
  for (const next of lines.slice(index + 1, index + 3)) {
    if (notInsured(next.text)) return { value: null, status: "not_insured" };
    if (!/^[\d\s.,]+(?:Kč|CZK)\s*$/i.test(next.text)) break;
    const amount = amountFrom(next.text);
    if (amount !== null) return { value: amount, status: "found" };
  }
  const nextValue = lines[index + 1]?.text ?? "";
  const nextUnit = lines[index + 2]?.text ?? "";
  if (/^[\d\s.,]+$/.test(nextValue) && /^(?:Kč|CZK)$/i.test(nextUnit)) {
    const amount = amountFrom(`${nextValue} ${nextUnit}`);
    if (amount !== null) return { value: amount, status: "found" };
  }
  return unreadable();
}

function mainSumInsured(lines: Line[]): Reading<number> {
  const fire = lines.findIndex(line => /^(?:pozar|vybuch)\b/.test(line.normalized));
  if (fire < 0) return missing();
  for (let index = fire; index < lines.length; index++) {
    const value = lines[index].normalized;
    if (/\bpojistna\s+castka\s*\/\s*limit\b/.test(value)) continue; // Table header.
    if (/(?:nesjednano|nepojisteno)\b/.test(value)) return { value: null, status: "not_insured" };
    if (/\b(?:sublimit|limit\s+pojistneho\s+plneni|spoluucast)\b/.test(value)) return missing();
    if (/\bpojistna\s+castka\b/.test(value)) {
      return amountAtLabel(lines, index, /^.*?Pojistn[áa]\s+[čc][áa]stka\s*:?\s*/i);
    }
  }
  return missing();
}

function coverage(lines: Line[]): Reading<DomexNeuronCoverage> {
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].normalized.match(/^varianta\s+pojisteni\s*:?\s*(.*)$/);
    if (!match) continue;
    const value = match[1] || lines[index + 1]?.normalized || "";
    if (notInsured(value)) return { value: null, status: "not_insured" };
    const found = /^(mini|opti|maxi|nop)$/.exec(value)?.[1] as DomexNeuronCoverage | undefined;
    return found ? { value: found, status: "found" } : unreadable();
  }
  return missing();
}

function typeFrom(lines: Line[], kind: "property" | "household"): Reading<string> {
  for (let index = 0; index < lines.length; index++) {
    const value = lines[index].normalized;
    if (!(kind === "property" ? /^hlavni\s+stavba\b/ : /^domacnost\b/).test(value)) continue;
    const following = lines[index + 1]?.normalized ?? "";
    const candidate = `${value} ${/^misto\s+pojisteni\b/.test(following) ? "" : following}`;
    if (kind === "property") {
      if (/\brodinny\s+dum\b/.test(candidate)) return { value: "dum", status: "found" };
      if (/\bbytova\s+jednotka\b/.test(candidate)) return { value: "byt", status: "found" };
    } else {
      if (/\btrvala\b|\btrvale\s+obydlena\b/.test(candidate)) return { value: "trvale", status: "found" };
      if (/\brekreacni\b/.test(candidate)) return { value: "rekreacni", status: "found" };
    }
    return unreadable();
  }
  return missing();
}

const isAddressValue = (text: string) => /\d/.test(text) && /\p{L}/u.test(text) &&
  !/^(?:(?:varianta|rizikova|domaci|zpusob|spoluucast|valorizace|rok|pocet|podlahova|zastavena|konstrukce|tarifni|cislo|strana|nabidka|tisk)\b|pojistn)/.test(normalize(text));

function address(lines: Line[]): string | null {
  const index = lines.findIndex(line => /^misto\s+pojisteni\b/.test(line.normalized));
  if (index < 0) return null;
  const row = lines[index];
  const label = row.items.find(item => /^misto\s+pojisteni\b/.test(normalize(item.str)));
  if (!label) return null;
  const inline = label.str.replace(/^M[ií]sto\s+poji[šs]t[eě]n[ií]\s*:?\s*/i, "").trim();
  if (inline && isAddressValue(inline)) return inline;

  // Neuron centers a multiline address vertically beside its label. Its first
  // line can precede the label in text order. Keep the middle value column and
  // exclude the separate risk-zone/assistance column on the right.
  const pageLines = lines.filter(line => line.page === row.page);
  const nextLabelY = Math.max(...pageLines.flatMap(line => line.items
    .filter(item => item.x <= label.x + 8 && item.y < label.y - 4).map(item => item.y)), label.y - 40);
  const sidebarX = Math.min(...pageLines.flatMap(line => line.items
    .filter(item => item.x > label.x + 100 && /^(?:rizikova\s+zona|domaci\s+asistence)/.test(normalize(item.str)))
    .map(item => item.x)), label.x + 420);
  const pieces = pageLines.flatMap(line => line.items).filter(item =>
    item.x >= label.x + label.width + 6 && item.x < sidebarX - 8 &&
    item.y <= label.y + 9 && item.y > nextLabelY + 2);
  const value = pieces.sort((a, b) => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x)
    .map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
  if (isAddressValue(value)) return value;
  // Text-only fixtures/OCR may put the complete address on the next line.
  const next = lines[index + 1]?.text.trim();
  return next && isAddressValue(next) ? next : null;
}

function firstAmount(lines: Line[], label: RegExp, originalLabel: RegExp): Reading<number> {
  const index = lines.findIndex(line => label.test(line.normalized));
  return index >= 0 ? amountAtLabel(lines, index, originalLabel) : missing();
}

const objectHeading = (line: Line, kind: DomexNeuronObjectKind) =>
  (kind === "property" ? /^hlavni\s+stavba\b/ : /^domacnost\b/).test(line.normalized);
const addressLabel = (line: Line) => /^misto\s+pojisteni\b/.test(line.normalized);
const material = (line: Line, kind: DomexNeuronObjectKind) => objectHeading(line, kind) || addressLabel(line) ||
  /^(?:varianta\s+pojisteni|pozar|vybuch)\b/.test(line.normalized);

function explicitlyUninsured(lines: Line[], kind: Kind): boolean {
  const first = lines[0];
  if (!first || headingKind(first.normalized) !== kind) return false;
  return /\b(?:nesjednano|nepojisteno)\s*[.!]?$/.test(first.normalized) ||
    /^(?:nesjednano|nepojisteno)\s*[.!]?$/.test(lines[1]?.normalized ?? "");
}

function objectBlocks(section: Section, kind: DomexNeuronObjectKind): Line[][] {
  const blocks: Line[][] = [];
  let current: Line[] = [];
  let lastHeading: Line | null = null;
  for (let index = 0; index < section.lines.length; index++) {
    const line = section.lines[index];
    const header = objectHeading(line, kind);
    const repeatedAddress = addressLabel(line) && current.some(addressLabel);
    const nearbyAddress = section.lines.slice(index + 1, index + 5).some(addressLabel);
    const restartedTable = current.some(value => /^varianta\s+pojisteni\b/.test(value.normalized)) &&
      section.lines.slice(index + 1, index + 5).some(value => /^varianta\s+pojisteni\b/.test(value.normalized));
    const continuation = header && lastHeading && lastHeading.page !== line.page &&
      lastHeading.normalized === line.normalized && !nearbyAddress && !restartedTable;
    if ((header && !continuation && current.some(value => material(value, kind))) || repeatedAddress) {
      // A centered address can begin on the line immediately above its label.
      const before = current.at(-1);
      const label = line.items.find(item => /^misto\s+pojisteni\b/.test(normalize(item.str)));
      const preamble = repeatedAddress && before && label && before.page === line.page &&
        before.items.every(item => item.x > label.x + 80 && item.y > label.y && item.y - label.y <= 9)
        ? current.pop() : undefined;
      if (current.some(value => material(value, kind))) blocks.push(current);
      current = preamble ? [preamble] : [];
    }
    current.push(line);
    if (header) lastHeading = line;
  }
  if (current.some(value => material(value, kind))) blocks.push(current);
  return blocks;
}

function addressReading(lines: Line[]): Reading<string> {
  const label = lines.find(addressLabel);
  if (!label) return missing();
  const raw = label.text.replace(/^M[ií]sto\s+poji[šs]t[eě]n[ií]\s*:?\s*/i, "");
  if (notInsured(raw)) return { value: null, status: "not_insured" };
  const value = safeText(address(lines));
  return value ? { value, status: "found" } : unreadable();
}

function makeObject(lines: Line[], kind: DomexNeuronObjectKind, id: string): DomexNeuronObject {
  const readings = {
    type: typeFrom(lines, kind), address: addressReading(lines), coverage: coverage(lines),
    sumInsured: mainSumInsured(lines),
    deductible: firstAmount(lines, /^spoluucast\s*:/, /^Spolu[úu][čc]ast\s*:?\s*/i),
    assistance: missing<DomexNeuronAssistance>(),
  };
  return {
    id, kind, type: readings.type.value, address: readings.address.value, coverage: readings.coverage.value,
    sumInsured: readings.sumInsured.value, deductible: readings.deductible.value, assistance: null,
    fields: Object.fromEntries(DOMEX_NEURON_OBJECT_FIELDS.map(field => [field, readings[field].status])) as DomexNeuronObject["fields"],
  };
}

const addressKey = (value: string) => normalize(value).replace(/\b(\d{3})\s+(\d{2})\b/g, "$1$2")
  .replace(/[^a-z0-9]+/g, " ").trim();

function assistanceAddress(lines: Line[], index: number, adjacent: Line[]): string | null {
  const anchor = lines[index];
  const subject = anchor.items.find(item => /^(?:hlavni\s+stavba|domacnost)\b/.test(normalize(item.str)));
  if (!subject) return null;
  const inline = anchor.text
    .replace(/^(?:HLAVN[ÍI]\s+STAVBA|DOM[ÁA]CNOST)(?:\s+(?:[čc]\.?\s*)?\d+)?(?:\s*[-–—:]\s*(?:Rodinn[ýy]\s+d[ůu]m|Bytov[áa]\s+jednotka|Trval[áa]|Rekrea[čc]n[ií]))?\s*/i, "")
    .replace(/\s*(?:Dom[áa]c[ií]\s+asistence|Nesjedn[áa]no|Nepoji[šs]t[eě]no).*$/i, "").trim();
  if (isAddressValue(inline)) return safeText(inline);
  const assistanceX = Math.min(...adjacent.flatMap(line => line.items
    .filter(item => /^(?:domaci\s+asistence|nesjednano|nepojisteno)/.test(normalize(item.str)))
    .map(item => item.x)), subject.x + 300);
  const value = lines.filter(line => line.page === anchor.page).flatMap(line => line.items)
    .filter(item => item.x >= subject.x + subject.width + 10 && item.x < assistanceX - 10 && Math.abs(item.y - subject.y) < 8)
    .sort((a, b) => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x)
    .map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
  if (isAddressValue(value)) return safeText(value);
  const labelled = address(adjacent);
  if (labelled) return safeText(labelled);
  const next = adjacent.slice(1).find(line => isAddressValue(line.text));
  return next ? safeText(next.text) : null;
}

function assistanceReading(adjacent: Line[]): Reading<DomexNeuronAssistance> {
  for (let index = 0; index < adjacent.length; index++) {
    const value = adjacent[index].normalized;
    if (/\b(?:nesjednano|nepojisteno)\s*$/.test(value)) return { value: null, status: "not_insured" };
    if (!/\bdomaci\s+asistence\b/.test(value)) continue;
    const candidate = `${value}${adjacent[index + 1]?.normalized === "plus" ? " plus" : ""}`;
    const match = [...candidate.matchAll(/\bdomaci\s+asistence\b/g)].length === 1
      ? candidate.match(/\bdomaci\s+asistence(?:\s+(plus))?\s*$/) : null;
    return match ? { value: match[1] ? "plus" : "basic", status: "found" } : unreadable();
  }
  return missing();
}

function assignAssistance(sections: Section[], objects: DomexNeuronObject[]): DomexExtractionStatus {
  if (!sections.length) return "not_found";
  if (sections.every(section => explicitlyUninsured(section.lines, "assistance"))) {
    for (const object of objects) object.fields.assistance = "not_insured";
    return "not_insured";
  }
  const answers = new Map<string, Reading<DomexNeuronAssistance>[]>();
  const ambiguous = new Set<string>();
  let readable = false;
  for (const section of sections) {
    const lines = section.lines;
    for (let index = 0; index < lines.length; index++) {
      const kind = /^hlavni\s+stavba\b/.test(lines[index].normalized) ? "property"
        : /^domacnost\b/.test(lines[index].normalized) ? "household" : null;
      if (!kind) continue;
      const adjacent = [lines[index]];
      for (const next of lines.slice(index + 1, index + 4)) {
        if (next.page !== lines[index].page || /^(?:hlavni\s+stavba|domacnost)\b/.test(next.normalized)) break;
        adjacent.push(next);
      }
      const reading = assistanceReading(adjacent);
      if (reading.status === "not_found") continue;
      const candidates = objects.filter(object => object.kind === kind);
      const place = assistanceAddress(lines, index, adjacent);
      const matching = place ? candidates.filter(object => object.address && addressKey(object.address) === addressKey(place)) : [];
      if (matching.length !== 1) {
        for (const object of matching.length ? matching : candidates) ambiguous.add(object.id);
        continue;
      }
      readable = true;
      const list = answers.get(matching[0].id) ?? [];
      list.push(reading); answers.set(matching[0].id, list);
    }
  }
  for (const object of objects) {
    const list = answers.get(object.id) ?? [];
    if (ambiguous.has(object.id) || (list.length && list.some(value => value.status !== list[0].status || value.value !== list[0].value))) {
      object.assistance = null; object.fields.assistance = "unreadable";
    } else if (list.length) {
      object.assistance = list[0].value; object.fields.assistance = list[0].status;
    }
  }
  return ambiguous.size || !readable ? "unreadable" : "found";
}

/** Neuron's property sections span several pages. A section boundary, rather
 * than a fixed number of following lines, assigns every label to its own part. */
export function parseDomexNeuronProperty(pages: DomexPropertyLayoutLine[][], forceNeuron = false) {
  const lines: Line[] = pages.flatMap((rows, page) => rows.map(row => ({ ...row, normalized: normalize(row.text), page })));
  const modernLayout = lines.some(line => /^varianta\s+pojisteni\b|^(?:hlavni\s+stavba|domacnost)(?:\s+(?:c\.?\s*)?\d+)?\s*[-–—:]/.test(line.normalized));
  const modernLiabilityOnly = lines.some(line => /^pojisteni\s+odpovednosti\s*(?:[:–—-]?\s*(?:nesjednano|nepojisteno))?\s*:?$/.test(line.normalized)) &&
    lines.some(line => /\bfrekvence\s+placeni\s*:|\bautomaticka\s+obnova\s+ke\s+konci\s+pojistneho\s+obdobi\s*:/.test(line.normalized));
  if (!forceNeuron && !modernLayout && !modernLiabilityOnly && !lines.some(line => /\bdomex\s+neuron\b/.test(line.normalized))) return null;
  const sections: Section[] = [];
  for (const line of lines) {
    const current = sections.at(-1);
    const assistancePart: boolean = current?.kind === "assistance" && /^(?:hlavni\s+stavba|domacnost)\b/.test(line.normalized);
    const kind: Kind | null = assistancePart ? null : headingKind(line.normalized);
    // Inner main-part headings refine their current section without splitting
    // its address or a table continued on the next page.
    if (kind && (!current || current.kind !== kind)) {
      sections.push({ kind, lines: [line] });
    } else {
      current?.lines.push(line);
    }
  }
  const data: DomexNeuronData = {
    parserVersion: DOMEX_NEURON_PARSER_VERSION,
    sections: { property: "not_found", household: "not_found", liability: "not_found", assistance: "not_found" },
    objects: [], liabilityFields: { sumInsured: "not_found", deductible: "not_found" },
  };
  const counts = { property: 0, household: 0 };
  const overflow = new Set<DomexNeuronObjectKind>();
  for (const kind of ["property", "household"] as const) {
    const parts = sections.filter(section => section.kind === kind);
    if (!parts.length) continue;
    let uninsured = false;
    for (const part of parts) {
      if (explicitlyUninsured(part.lines, kind)) { uninsured = true; continue; }
      for (const block of objectBlocks(part, kind)) {
        const innerHeading = block.findIndex(line => objectHeading(line, kind));
        if (explicitlyUninsured(innerHeading >= 0 ? block.slice(innerHeading) : block, kind)) { uninsured = true; continue; }
        if (data.objects.length >= DOMEX_NEURON_MAX_OBJECTS) { overflow.add(kind); continue; }
        data.objects.push(makeObject(block, kind, `${kind}-${++counts[kind]}`));
      }
    }
    data.sections[kind] = overflow.has(kind) ? "unreadable" : counts[kind] ? "found" : uninsured ? "not_insured" : "unreadable";
  }
  const liabilitySection = sections.find(section => section.kind === "liability");
  const liability = liabilitySection?.lines ?? [];
  const liabilitySum = firstAmount(liability, /^limit\s+pojistneho\s+plneni\s*(?::|\d|$)/, /^Limit\s+pojistn[eé]ho\s+pln[eě]n[ií]\s*:?\s*/i);
  const liabilityDeductible = firstAmount(liability, /^spoluucast\s*:/, /^Spolu[úu][čc]ast\s*:?\s*/i);
  if (liabilitySection && explicitlyUninsured(liability, "liability")) {
    data.sections.liability = "not_insured";
    data.liabilityFields = { sumInsured: "not_insured", deductible: "not_insured" };
  } else if (liabilitySection) {
    data.sections.liability = liabilitySum.status === "found" || liabilityDeductible.status === "found" ? "found" : "unreadable";
    data.liabilityFields = { sumInsured: liabilitySum.status, deductible: liabilityDeductible.status };
  }
  data.sections.assistance = assignAssistance(sections.filter(section => section.kind === "assistance"), data.objects);
  const building = data.objects.find(object => object.kind === "property");
  const household = data.objects.find(object => object.kind === "household");
  return {
    domexNeuron: data,
    domexAddress: data.objects.find(object => object.address)?.address ?? null,
    domexPropertyAddress: building?.address ?? null, domexHouseholdAddress: household?.address ?? null,
    domexPropertyType: building?.type ?? null, domexPropertyCoverage: building?.coverage ?? null,
    domexPropertySumInsured: building?.sumInsured ?? null, domexPropertyDeductible: building?.deductible ?? null,
    domexHouseholdType: household?.type ?? null, domexHouseholdCoverage: household?.coverage ?? null,
    domexHouseholdSumInsured: household?.sumInsured ?? null, domexHouseholdDeductible: household?.deductible ?? null,
    domexLiabilitySumInsured: data.sections.liability === "not_insured" ? null : liabilitySum.value,
    domexLiabilityDeductible: data.sections.liability === "not_insured" ? null : liabilityDeductible.value,
    domexPropertyAssistance: building?.assistance ?? null, domexHouseholdAssistance: household?.assistance ?? null,
    domexAssistancePlus: data.objects.some(object => object.assistance === "plus") ? true
      : data.objects.some(object => object.assistance === "basic") ? false : null,
    ...(overflow.size ? { pdfImportWarnings: [`DOMEX Neuron: PDF obsahuje více než ${DOMEX_NEURON_MAX_OBJECTS} objektů; načtené údaje vyžadují ruční kontrolu.`] } : {}),
  };
}
