export type DomexPropertyLayoutLine = {
  text: string;
  items: { str: string; x: number; y: number; width: number }[];
};

export type DomexNeuronPropertyFields = {
  domexPropertyAddress?: string | null;
  domexHouseholdAddress?: string | null;
  domexPropertyAssistance?: "basic" | "plus" | null;
  domexHouseholdAssistance?: "basic" | "plus" | null;
};

type Kind = "property" | "household" | "liability" | "assistance" | "other";
type Line = DomexPropertyLayoutLine & { normalized: string; page: number };
type Section = { kind: Kind; lines: Line[] };
type Assistance = "basic" | "plus";

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLowerCase().replace(/\s+/g, " ").trim();
const headingKind = (value: string): Kind | null => {
  if (/^pojisteni\s+staveb\s*:?$/.test(value)) return "property";
  if (/^pojisteni\s+domacnosti\s*:?$/.test(value)) return "household";
  if (/^pojisteni\s+odpovednosti(?:\s+obcana\s+v\s+beznem\s+obcanskem\s+zivote)?\s*:?$/.test(value)) return "liability";
  if (/^asistencni\s+sluzby\s*:?$/.test(value)) return "assistance";
  if (/^(?:spolecna\s+ustanoveni|prohlaseni\s+pojistnika|doplnkova\s+pojisteni|vedlejsi\s+stavb[ay])\b/.test(value)) return "other";
  if (/^hlavni\s+stavba\s*[-–—:]/.test(value)) return "property";
  if (/^domacnost\s*[-–—:]/.test(value)) return "household";
  return null;
};

const amountFrom = (value: string): number | null => {
  const match = value.match(/(?:^|[^\d.,-])((?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*(?:Kč|CZK)(?=$|\s|[.,;])/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

function amountAtLabel(lines: Line[], index: number, label: RegExp): number | null {
  const text = lines[index].text.replace(label, "");
  const inline = amountFrom(text);
  if (inline !== null) return inline;
  // A split value must remain adjacent to its label, within the same section.
  for (const next of lines.slice(index + 1, index + 3)) {
    if (!/^[\d\s.,]+(?:Kč|CZK)\s*$/i.test(next.text)) break;
    const amount = amountFrom(next.text);
    if (amount !== null) return amount;
  }
  return null;
}

function mainSumInsured(lines: Line[]): number | null {
  const fire = lines.findIndex(line => /^(?:pozar|vybuch)\b/.test(line.normalized));
  if (fire < 0) return null;
  for (let index = fire; index < lines.length; index++) {
    const value = lines[index].normalized;
    if (/\bpojistna\s+castka\s*\/\s*limit\b/.test(value)) continue; // Table header.
    if (/\b(?:sublimit|limit\s+pojistneho\s+plneni|spoluucast|nesjednano)\b/.test(value)) return null;
    if (/\bpojistna\s+castka\b/.test(value)) {
      return amountAtLabel(lines, index, /^.*?Pojistn[áa]\s+[čc][áa]stka\s*:?\s*/i);
    }
  }
  return null;
}

function coverage(lines: Line[]): string | null {
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].normalized.match(/^varianta\s+pojisteni\s*:?\s*(.*)$/);
    if (!match) continue;
    const value = match[1] || lines[index + 1]?.normalized || "";
    return /^(mini|opti|maxi|nop)$/.exec(value)?.[1] ?? null;
  }
  return null;
}

function typeFrom(lines: Line[], kind: "property" | "household"): string | null {
  for (let index = 0; index < lines.length; index++) {
    const value = lines[index].normalized;
    if (!(kind === "property" ? /^hlavni\s+stavba\b/ : /^domacnost\b/).test(value)) continue;
    const candidate = `${value} ${lines[index + 1]?.normalized ?? ""}`;
    if (kind === "property") {
      if (/\brodinny\s+dum\b/.test(candidate)) return "dum";
      if (/\bbytova\s+jednotka\b/.test(candidate)) return "byt";
    } else {
      if (/\btrvala\b|\btrvale\s+obydlena\b/.test(candidate)) return "trvale";
      if (/\brekreacni\b/.test(candidate)) return "rekreacni";
    }
  }
  return null;
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

function firstAmount(lines: Line[], label: RegExp, originalLabel: RegExp): number | null {
  const index = lines.findIndex(line => label.test(line.normalized));
  return index >= 0 ? amountAtLabel(lines, index, originalLabel) : null;
}

function assistanceByPart(lines: Line[], enabled: { property: boolean; household: boolean }) {
  const answers: Record<"property" | "household", (Assistance | null)[]> = { property: [], household: [] };
  let context: "property" | "household" | null = null;
  let contextStart = -1;
  for (let index = 0; index < lines.length; index++) {
    const value = lines[index].normalized;
    if (/^hlavni\s+stavba\b/.test(value)) { context = "property"; contextStart = index; }
    else if (/^domacnost\b/.test(value)) { context = "household"; contextStart = index; }
    if (contextStart < 0 || lines[index].page !== lines[contextStart].page || index - contextStart > 3) context = null;
    if (!context || !enabled[context]) continue;
    if (!/\bdomaci\s+asistence\b/.test(value)) continue;
    const candidate = `${value}${lines[index + 1]?.normalized === "plus" ? " plus" : ""}`;
    const match = [...candidate.matchAll(/\bdomaci\s+asistence\b/g)].length === 1
      ? candidate.match(/\bdomaci\s+asistence(?:\s+(plus))?\s*$/) : null;
    answers[context].push(match ? match[1] ? "plus" : "basic" : null);
    context = null;
  }
  const pick = (kind: "property" | "household") => answers[kind].length && answers[kind].every(value => value !== null && value === answers[kind][0])
    ? answers[kind][0] : null;
  return { property: pick("property"), household: pick("household") };
}

/** Neuron's property sections span several pages. A section boundary, rather
 * than a fixed number of following lines, assigns every label to its own part. */
export function parseDomexNeuronProperty(pages: DomexPropertyLayoutLine[][]) {
  const lines: Line[] = pages.flatMap((rows, page) => rows.map(row => ({ ...row, normalized: normalize(row.text), page })));
  const modernLayout = lines.some(line => /^varianta\s+pojisteni\b|^(?:hlavni\s+stavba|domacnost)\s*[-–—:]/.test(line.normalized));
  const modernLiabilityOnly = lines.some(line => /^pojisteni\s+odpovednosti\s*:?$/.test(line.normalized)) &&
    lines.some(line => /\bfrekvence\s+placeni\s*:|\bautomaticka\s+obnova\s+ke\s+konci\s+pojistneho\s+obdobi\s*:/.test(line.normalized));
  if (!modernLayout && !modernLiabilityOnly) return null;
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
  const building = sections.find(section => section.kind === "property")?.lines ?? [];
  const household = sections.find(section => section.kind === "household")?.lines ?? [];
  const liability = sections.find(section => section.kind === "liability")?.lines ?? [];
  const assistance = assistanceByPart(sections.find(section => section.kind === "assistance")?.lines ?? [],
    { property: building.length > 0, household: household.length > 0 });
  const propertyAddress = address(building);
  const householdAddress = address(household);
  return {
    domexAddress: propertyAddress ?? householdAddress,
    domexPropertyAddress: propertyAddress,
    domexHouseholdAddress: householdAddress,
    domexPropertyType: typeFrom(building, "property"),
    domexPropertyCoverage: coverage(building),
    domexPropertySumInsured: mainSumInsured(building),
    domexPropertyDeductible: firstAmount(building, /^spoluucast\s*:/, /^Spolu[úu][čc]ast\s*:?\s*/i),
    domexHouseholdType: typeFrom(household, "household"),
    domexHouseholdCoverage: coverage(household),
    domexHouseholdSumInsured: mainSumInsured(household),
    domexHouseholdDeductible: firstAmount(household, /^spoluucast\s*:/, /^Spolu[úu][čc]ast\s*:?\s*/i),
    domexLiabilitySumInsured: firstAmount(liability, /^limit\s+pojistneho\s+plneni\s*(?::|\d|$)/, /^Limit\s+pojistn[eé]ho\s+pln[eě]n[ií]\s*:?\s*/i),
    domexLiabilityDeductible: firstAmount(liability, /^spoluucast\s*:/, /^Spolu[úu][čc]ast\s*:?\s*/i),
    domexPropertyAssistance: assistance.property,
    domexHouseholdAssistance: assistance.household,
    domexAssistancePlus: assistance.property === "plus" || assistance.household === "plus" ? true
      : assistance.property === "basic" || assistance.household === "basic" ? false : null,
  };
}
