export type CppAutoContractIdentityItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

export type CppAutoContractIdentityLine = {
  text: string;
  items: readonly CppAutoContractIdentityItem[];
};

export type CppAutoContractIdentityPage = readonly CppAutoContractIdentityLine[];

export type CppAutoContractIdentity = {
  contractNumber: string | null;
  replacementOriginalContractNumber: string | null;
  warnings: string[];
};

type Kind = "contract" | "replacement";
type Box = { left: number; right: number; y: number };
type Span = Box & { start: number; end: number };
type Row = { text: string; spans: Span[] };
type Label = { kind: Kind; start: number; end: number; box: Box | null };
type NumberResult = { value: string | null; ambiguous: boolean };

const ROW_TOLERANCE = 2;
const BOX_PADDING = 6;
const MAX_BELOW_DISTANCE = 32;
const MAX_INLINE_GAP = 48;

const normalizedText = (value: string): string => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const labelPattern = () => /\b(cislo\s+(?:(?:navrhu|nabidky)\s+)?pojistne\s+smlouvy|nahrada\s+smlouvy)\b/g;

function prepareRow(line: CppAutoContractIdentityLine): Row {
  const positionedItems = line.items.filter((item) => item.str.trim());
  if (!positionedItems.length || positionedItems.some((item) =>
    ![item.x, item.y, item.width].every(Number.isFinite) || item.width <= 0
  )) return { text: normalizedText(line.text), spans: [] };

  const spans: Span[] = [];
  let text = "";
  let previousRight: number | null = null;
  for (const item of [...positionedItems].sort((a, b) => a.x - b.x)) {
    if (previousRight != null && item.x - previousRight > 1.5) text += " ";
    const value = normalizedText(item.str);
    const start = text.length;
    text += value;
    spans.push({ start, end: text.length, left: item.x, right: item.x + item.width, y: item.y });
    previousRight = item.x + item.width;
  }

  // Text-only OCR rows may have unusable word geometry. Inline labelled values
  // remain safe, but cannot supply a spatial box for a neighbouring value.
  if (!labelPattern().test(text) && labelPattern().test(normalizedText(line.text))) {
    return { text: normalizedText(line.text), spans: [] };
  }
  return { text, spans };
}

function bounds(row: Row, start: number, end: number): Box | null {
  const parts = row.spans.flatMap((span) => {
    const overlapStart = Math.max(start, span.start);
    const overlapEnd = Math.min(end, span.end);
    if (overlapStart >= overlapEnd) return [];
    const width = span.right - span.left;
    const length = span.end - span.start;
    return [{
      left: span.left + width * (overlapStart - span.start) / length,
      right: span.left + width * (overlapEnd - span.start) / length,
      y: span.y,
    }];
  });
  if (!parts.length) return null;
  return {
    left: Math.min(...parts.map((part) => part.left)),
    right: Math.max(...parts.map((part) => part.right)),
    y: parts[0].y,
  };
}

function labelsIn(row: Row): Label[] {
  const labels: Label[] = [];
  for (const match of row.text.matchAll(labelPattern())) {
    const span = row.spans.find((part) => part.start <= match.index && part.end > match.index);
    const prefix = row.text.slice(span?.start ?? 0, match.index).trim();
    const previous = labels[labels.length - 1];
    const previousTail = previous ? row.text.slice(previous.end, match.index) : null;
    const followsIdentityBox = previousTail != null && (
      !previousTail.replace(/[:：]/g, "").trim() || readNumber(previousTail).value != null
    );
    // A sentence mentioning a contract number is not a labelled header field.
    if (prefix && !followsIdentityBox) continue;
    labels.push({
      kind: match[0].startsWith("nahrada") ? "replacement" : "contract",
      start: match.index,
      end: match.index + match[0].length,
      box: bounds(row, match.index, match.index + match[0].length),
    });
  }
  return labels;
}

function readNumber(value: string): NumberResult {
  const raw = value.replace(/^\s*[:：#]?\s*/, "").trim();
  if (!/^\d[\d ]*$/.test(raw)) return { value: null, ambiguous: false };
  const groups = raw.split(/ +/);
  // Two complete identifiers in a box must never become one concatenated ID.
  if (groups.length > 1 && groups.some((group) => group.length >= 6)) {
    return { value: null, ambiguous: true };
  }
  const digits = groups.join("");
  return { value: /^\d{6,14}$/.test(digits) ? digits : null, ambiguous: false };
}

function inlineNumber(row: Row, label: Label, end: number): NumberResult {
  const tail = row.text.slice(label.end, end);
  const result = readNumber(tail);
  if (!result.value || !label.box) return result;
  const digitStart = label.end + tail.search(/\d/);
  const numberBox = bounds(row, digitStart, end);
  if (!numberBox || numberBox.left < label.box.right - ROW_TOLERANCE ||
    numberBox.left - label.box.right > MAX_INLINE_GAP) {
    return { value: null, ambiguous: false };
  }
  return result;
}

function hasInlineContent(row: Row, label: Label, end: number): boolean {
  const tail = row.text.slice(label.end, end);
  const content = tail.replace(/^\s*[:：#]?\s*/, "");
  if (!content.trim()) return false;
  if (!label.box) return true;
  const start = end - content.length;
  const contentBox = bounds(row, start, start + 1);
  return contentBox != null && contentBox.left >= label.box.right - ROW_TOLERANCE &&
    contentBox.left - label.box.right <= MAX_INLINE_GAP;
}

function foreignFieldLabel(text: string): boolean {
  return /[a-z].*[:：]\s*$/.test(text) ||
    /^(?:i\s*c(?:o)?|r\s*c|rodne\s+cislo(?:\s*\/\s*i\s*c(?:o)?)?|variabilni\s+symbol|vs|telefon|mobil|vin|datum\s+narozeni|cislo\s+uctu|dic)\s*[:：]?\s*$/.test(text);
}

function belowNumbers(rows: Row[], rowIndex: number, label: Label, siblings: Label[]): NumberResult[] {
  const box = label.box;
  if (!box) {
    // Without coordinates only a single, immediately adjacent label/value pair
    // is supported. A row containing two boxes has no safe text-only ordering.
    const row = rows[rowIndex];
    if (labelsIn(row).length !== 1 || row.text.slice(label.end).replace(/[:：]/g, "").trim()) return [];
    if (rows.some((candidate) => candidate.spans.length)) return [];
    return rows[rowIndex + 1] ? [readNumber(rows[rowIndex + 1].text)] : [];
  }

  const localRows = rows.flatMap((row, index) => {
    if (index === rowIndex) return [];
    const parts = row.spans.filter((part) => {
      const distance = box.y - part.y;
      const centre = (part.left + part.right) / 2;
      const numeric = /^\d[\d ]*$/.test(row.text.slice(part.start, part.end));
      const withinColumn = numeric
        ? centre >= box.left - BOX_PADDING && centre <= box.right + BOX_PADDING
        : part.right > box.left - BOX_PADDING && part.left < box.right + BOX_PADDING;
      return distance > ROW_TOLERANCE && distance <= MAX_BELOW_DISTANCE && withinColumn;
    });
    if (!parts.length) return [];
    const first = parts[0];
    const foreignLabel = row.spans.some((part) =>
      part.right <= first.left && first.left - part.right <= MAX_INLINE_GAP &&
      foreignFieldLabel(row.text.slice(part.start, part.end))
    );
    const contested = parts.some((part) => {
      const centre = (part.left + part.right) / 2;
      return /^\d[\d ]*$/.test(row.text.slice(part.start, part.end)) && siblings.some((other) =>
        other !== label && other.box && Math.abs(other.box.y - box.y) <= ROW_TOLERANCE &&
        centre >= other.box.left - BOX_PADDING && centre <= other.box.right + BOX_PADDING
      );
    });
    return [{
      distance: box.y - parts[0].y,
      text: foreignLabel ? "field boundary" : parts.map((part) => row.text.slice(part.start, part.end)).join(" "),
      contested,
    }];
  }).sort((a, b) => a.distance - b.distance);

  const results: NumberResult[] = [];
  for (const row of localRows) {
    const result = readNumber(row.text);
    // A neighbouring field label, date, or other content closes this box.
    if (!result.value && !result.ambiguous) break;
    results.push(row.contested ? { value: null, ambiguous: true } : result);
  }
  return results;
}

/** Read only explicit current/replacement fields, keeping page and box bounds.
 * Warnings are fixed codes: never include PDF text or an identifier in them. */
export function resolveCppAutoContractIdentity(
  pages: readonly CppAutoContractIdentityPage[],
): CppAutoContractIdentity {
  const candidates = { contract: new Set<string>(), replacement: new Set<string>() };
  const ambiguous = { contract: false, replacement: false };
  const seen = { contract: false, replacement: false };

  for (const page of pages) {
    const rows = page.map(prepareRow);
    rows.forEach((row, rowIndex) => {
      const labels = labelsIn(row);
      labels.forEach((label, labelIndex) => {
        seen[label.kind] = true;
        const fieldEnd = labels[labelIndex + 1]?.start ?? row.text.length;
        const inline = inlineNumber(row, label, fieldEnd);
        const results = inline.value || inline.ambiguous ? [inline]
          : hasInlineContent(row, label, fieldEnd) ? [] : belowNumbers(rows, rowIndex, label, labels);
        for (const result of results) {
          if (result.value) candidates[label.kind].add(result.value);
          if (result.ambiguous) ambiguous[label.kind] = true;
        }
      });
    });
  }

  const warnings: string[] = [];
  const resolve = (kind: Kind): string | null => {
    if (ambiguous[kind] || candidates[kind].size > 1) {
      warnings.push(`cpp_auto_${kind}_number_ambiguous`);
      return null;
    }
    const value = [...candidates[kind]][0] ?? null;
    if (!value && (kind === "contract" || seen[kind])) warnings.push(`cpp_auto_${kind}_number_missing`);
    return value;
  };
  const contractNumber = resolve("contract");
  let replacementOriginalContractNumber = resolve("replacement");
  if (contractNumber && replacementOriginalContractNumber === contractNumber) {
    replacementOriginalContractNumber = null;
    warnings.push("cpp_auto_replacement_matches_contract");
  }
  return { contractNumber, replacementOriginalContractNumber, warnings };
}
