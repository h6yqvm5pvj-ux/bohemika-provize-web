import type { PdfDocumentText } from "./pdfDocumentText";
import type { FlexiPdfResult } from "./parseFlexiPdf";

const ascii = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
type ChangeItem = { text: string; ascii: string; page: number; x: number; y: number; width: number; positioned: boolean };

function readField<T extends string | number>(items: ChangeItem[], label: RegExp, parse: (text: string) => T | null): T | null {
  const values = new Set<T>();
  items.forEach((item, index) => {
    const match = item.ascii.match(label);
    if (!match) return;
    const inline = parse(item.text.slice(match[0].length).trim());
    if (inline !== null) { values.add(inline); return; }
    if (!item.positioned) {
      const next = items[index + 1];
      const value = next?.page === item.page ? parse(next.text) : null;
      if (value !== null) values.add(value);
      return;
    }
    // Some forms store a value before its label in text order. Match the
    // labelled row/column, never another person's name or the old premium.
    const nearby = items.filter(candidate => candidate !== item && candidate.positioned && candidate.page === item.page && (
      (Math.abs(candidate.y - item.y) <= 3 && candidate.x >= item.x + item.width - 2) ||
      (item.y - candidate.y > 3 && item.y - candidate.y <= 24 && Math.abs(candidate.x - item.x) <= 4)
    )).sort((a, b) =>
      Math.abs(a.y - item.y) + Math.abs(a.x - item.x) - Math.abs(b.y - item.y) - Math.abs(b.x - item.x)
    );
    for (const candidate of nearby) {
      const value = parse(candidate.text);
      if (value !== null) { values.add(value); break; }
    }
  });
  return values.size === 1 ? [...values][0] : null;
}

const parseDate = (text: string): string | null => {
  const match = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/.exec(text);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number(year) < 2000 || Number(year) > 2100 || date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const parsePremium = (text: string): number | null => {
  const match = /^(\d{1,3}(?:\s\d{3})+|\d+)(?:([.,]\d{1,2}))?\s*(?:kc|czk)?$/.exec(ascii(text));
  if (!match) return null;
  const value = Number(`${match[1].replace(/\s/g, "")}${(match[2] ?? "").replace(",", ".")}`);
  return Number.isFinite(value) && value > 0 && value <= 1_000_000_000 ? Math.round(value) : null;
};

const parseName = (text: string): string | null =>
  /^[\p{L}\p{M}][\p{L}\p{M}\s.'’\-]{0,99}$/u.test(text) ? text : null;

/** FLEXI change requests have their own fields; appended contracts and payment
 * instructions must not supply missing values for the requested change. */
export function parseFlexiChangeDocument(doc: PdfDocumentText): FlexiPdfResult | null {
  const items: ChangeItem[] = doc.pages.flatMap((page, pageIndex) => page.items.flatMap(item => {
    const text = item.str.normalize("NFC").replace(/\s+/g, " ").trim();
    if (!text) return [];
    return [{ text, ascii: ascii(text), page: pageIndex, x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0), width: Number(item.width ?? 0),
      positioned: Array.isArray(item.transform) && item.transform.length >= 6 }];
  }));
  const text = items.map(item => item.ascii).join(" ");
  if (!/\bflexi\b/.test(text) || !/\bzadost o zmenu v pojistne smlouve\b/.test(text)) return null;

  const premiumItems = items.flatMap((item, index) => {
    if (!/^zmena bezneho pojistneho za pojistne obdobi\b/.test(item.ascii)) return [];
    let end = index + 1;
    while (end < items.length && items[end].page === item.page &&
      !/^(?:pojisten[ay] osoba|pojisteny|pojistnik|obmyslen|zprostredkovatel)\b/.test(items[end].ascii)) end++;
    return items.slice(index + 1, end);
  });
  const names = new Set<string>();
  items.forEach((item, index) => {
    if (!/^(?:[a-z]\s*[.)]?\s+)?pojistnik\s*:?$/.test(item.ascii)) return;
    let end = index + 1;
    while (end < items.length && items[end].page === item.page &&
      !/^(?:pozadovane datum ucinnosti|zmena bezneho pojistneho|pojisten[ay] osoba|pojisteny|pojistnik|obmyslen|zprostredkovatel)\b/.test(items[end].ascii)) end++;
    const section = items.slice(index + 1, end);
    const first = readField(section, /^jmeno\s*:\s*/, parseName);
    const last = readField(section, /^prijmeni\s*:\s*/, parseName);
    if (first && last) names.add(`${first} ${last}`);
  });

  return {
    isEndorsement: true,
    contractNumber: readField(items, /^cislo pojistne smlouvy\s*:?\s*/, value => {
      const digits = value.replace(/\s/g, "");
      return /^\d{6,14}$/.test(digits) ? digits : null;
    }),
    clientName: names.size === 1 ? [...names][0] : null,
    policyStartDate: readField(items, /^pozadovane datum ucinnosti\s*:?\s*/, parseDate),
    contractSignedDate: readField(items, /^datum sepsani zadosti\s*:?\s*/, parseDate),
    amount: readField(premiumItems, /^nove mesicni pojistne\s*:\s*/, parsePremium),
    frequency: "monthly",
  };
}
