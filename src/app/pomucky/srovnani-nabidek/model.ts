import type { ContactDetails } from "../tvorba/contactQr";
import { COMPARISON_ICONS } from "./icons";
import { insurerById } from "./insurers";
import { INSURANCE_TYPES, LIFE_COVERAGES, type InsuranceType, type LifeCoverageKind } from "./lifeCoverage";
import { ALL_COVERAGES, createCoverageDetails, coverageDetailsText, parseCoverageDetails, type CoverageKind, type CoverageDetails } from "./coverage";

export const TONES = [
  { id: "neutral", label: "Bez zvýraznění", color: "#17243b", fill: "#ffffff", icon: "none" },
  { id: "positive", label: "Výhoda / zahrnuto", color: "#19624d", fill: "#edf8f2", icon: "check" },
  { id: "warning", label: "Pozor / omezení", color: "#92400e", fill: "#fff5db", icon: "alert" },
  { id: "negative", label: "Nevýhoda / nezahrnuto", color: "#b42335", fill: "#fff0f2", icon: "cross" },
] as const;
export type CellTone = typeof TONES[number]["id"];
export type ComparisonCell = { text: string; tone: CellTone; details?: CoverageDetails };
export type Offer = { id: string; label: string; insurerId: string; customInsurer: string; product: string; year: string; premium: string; note: string };
export type ComparisonRow = { id: string; kind: "item" | "section"; label: string; icon: string; coverage?: CoverageKind; cells: Record<string, ComparisonCell> };
export type ComparisonDocument = {
  version: 2;
  insuranceType: InsuranceType;
  title: string;
  firstName: string;
  lastName: string;
  date: string;
  introduction: string;
  offers: Offer[];
  recommendedOfferId?: string;
  rows: ComparisonRow[];
  notesTitle: string;
  notes: string;
};
export const emptyContact: ContactDetails = { fullName: "", jobTitle: "Finanční poradce", email: "", phone: "", companyId: "", officeAddress: "" };
export const newId = () => crypto.randomUUID();
export const emptyCell = (coverage?: CoverageKind): ComparisonCell => ({ text: "", tone: "neutral", ...(coverage ? { details: createCoverageDetails(coverage) } : {}) });
export function createOffer(label: string): Offer {
  return { id: newId(), label, insurerId: "", customInsurer: "", product: "", year: "", premium: "", note: "" };
}
export function createRow(offers: Offer[], label = "", icon = "shield", kind: ComparisonRow["kind"] = "item"): ComparisonRow {
  return { id: newId(), kind, label, icon, cells: Object.fromEntries(offers.map(offer => [offer.id, emptyCell()])) };
}
export function createDocument(): ComparisonDocument {
  const offers = [createOffer("Současná smlouva"), createOffer("Navrhované řešení")];
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { version: 2, insuranceType: "", title: "Srovnání pojištění", firstName: "", lastName: "", date, introduction: "", offers,
    rows: [createRow(offers)], notesTitle: "Poznámky a doporučení", notes: "" };
}
export const insurerName = (offer: Offer) => insurerById(offer.insurerId)?.name || offer.customInsurer || "Pojišťovna";
export const clientName = (doc: ComparisonDocument) => [doc.firstName.trim(), doc.lastName.trim()].filter(Boolean).join(" ");
export function formatDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${Number(day)}. ${Number(month)}. ${year}`;
}
export function addOffer(doc: ComparisonDocument): ComparisonDocument {
  const offer = createOffer(`Nabídka ${doc.offers.length}`);
  return { ...doc, offers: [...doc.offers, offer], rows: doc.rows.map(row => ({ ...row, cells: { ...row.cells, [offer.id]: emptyCell(row.coverage) } })) };
}
export function comparisonCellText(cell: ComparisonCell): string {
  return [cell.details ? coverageDetailsText(cell.details) : "", cell.text.trim()].filter(Boolean).join("\n");
}
export function changeRowCoverage(row: ComparisonRow, coverage?: CoverageKind): ComparisonRow {
  if (row.coverage === coverage || row.kind !== "item") return row;
  const definition = ALL_COVERAGES.find(item => item.id === coverage);
  const cells = Object.fromEntries(Object.entries(row.cells).map(([id, cell]) => [id, {
    text: comparisonCellText(cell), tone: cell.tone,
    ...(coverage ? { details: createCoverageDetails(coverage) } : {}),
  }]));
  const rest = { ...row }; delete rest.coverage;
  return { ...rest, label: definition?.label || row.label,
    icon: definition?.icon || row.icon, ...(coverage ? { coverage } : {}), cells };
}
export function appendLifeCoverage(doc: ComparisonDocument, coverage: LifeCoverageKind): ComparisonDocument {
  return appendCoverage(doc, coverage);
}
export function appendCoverage(doc: ComparisonDocument, coverage: CoverageKind): ComparisonDocument {
  const row = changeRowCoverage(createRow(doc.offers), coverage);
  const empty = doc.rows.length === 1 && !doc.rows[0].label.trim() && Object.values(doc.rows[0].cells).every(cell => !comparisonCellText(cell));
  return { ...doc, insuranceType: ALL_COVERAGES.find(item => item.id === coverage)!.category, rows: [...(empty ? [] : doc.rows), row] };
}
export function removeOffer(doc: ComparisonDocument, id: string): ComparisonDocument {
  if (doc.offers.length <= 2 || doc.offers[0].id === id) return doc;
  const next = { ...doc, offers: doc.offers.filter(offer => offer.id !== id), rows: doc.rows.map(row => {
    const cells = { ...row.cells }; delete cells[id]; return { ...row, cells };
  }) };
  if (next.recommendedOfferId === id) delete next.recommendedOfferId;
  return next;
}
export function recommendOffer(doc: ComparisonDocument, id?: string): ComparisonDocument {
  if (id === doc.recommendedOfferId || (id !== undefined && !doc.offers.slice(1).some(offer => offer.id === id))) return doc;
  const next = { ...doc };
  if (id === undefined) delete next.recommendedOfferId;
  else next.recommendedOfferId = id;
  return next;
}
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return items;
  const result = [...items]; [result[index], result[next]] = [result[next], result[index]]; return result;
}
export const TEMPLATES = [
  { id: "life", label: "Životní pojištění", icon: "heart", rows: LIFE_COVERAGES.map(item => [item.label, item.icon] as const) },
  { id: "property", label: "Majetek a domácnost", icon: "home", rows: [["Nemovitost", "home"], ["Domácnost", "home"], ["Odpovědnost", "umbrella"], ["Živelní rizika", "shield"], ["Vodovodní škody", "home"], ["Odcizení a vandalismus", "shield"], ["Asistenční služby", "info"], ["Spoluúčast", "wallet"]] },
  { id: "auto", label: "Pojištění vozidel", icon: "car", rows: [["Povinné ručení", "car"], ["Havarijní pojištění", "shield"], ["Pojištění skel", "car"], ["Střet se zvěří", "alert"], ["Odcizení", "shield"], ["Asistenční služby", "info"], ["Náhradní vozidlo", "car"], ["Spoluúčast", "wallet"]] },
] as const;
export function appendTemplate(doc: ComparisonDocument, id: string): ComparisonDocument {
  const template = TEMPLATES.find(item => item.id === id);
  if (!template) return doc;
  const rows = doc.rows.length === 1 && !doc.rows[0].label && Object.values(doc.rows[0].cells).every(cell => !comparisonCellText(cell)) ? [] : doc.rows;
  const autoBase: CoverageKind[] = ["auto-liability", "auto-collision", "auto-glass", "auto-assistance"];
  const items = template.id === "life" ? LIFE_COVERAGES.map(item => changeRowCoverage(createRow(doc.offers), item.id))
    : template.id === "auto" ? autoBase.map(kind => changeRowCoverage(createRow(doc.offers), kind))
    : template.rows.map(([label, icon]) => createRow(doc.offers, label, icon));
  return { ...doc, insuranceType: template.id, rows: [...rows, createRow(doc.offers, template.label, template.icon, "section"), ...items] };
}
// Each PDF sheet shows the current contract beside one or up to three proposals.
// Extra proposals retain the same current contract, rather than losing context.
export function offerGroups(offers: Offer[], proposalsPerGroup: 1 | 3 = 3): Offer[][] {
  const groups: Offer[][] = [];
  for (let i = 1; i < offers.length; i += proposalsPerGroup) groups.push([offers[0], ...offers.slice(i, i + proposalsPerGroup)]);
  return groups;
}
export function fileStem(doc: ComparisonDocument): string {
  return (`Srovnani-${clientName(doc) || "pojisteni"}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 100);
}

/** Validate imported files without trusting their IDs, markup, logo paths or structure. */
export function parseDocument(raw: string): ComparisonDocument {
  const fail = (): never => { throw new Error("Soubor není platné srovnání nabídek. Otevři soubor uložený z tohoto editoru."); };
  if (raw.length > 5_000_000) fail();
  let value: unknown; try { value = JSON.parse(raw); } catch { return fail(); }
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
  const text = (value: unknown, max = 20_000): string => typeof value === "string" && value.length <= max ? value : fail();
  const data = record(value);
  if ((data.version !== 1 && data.version !== 2) || !Array.isArray(data.offers) || data.offers.length < 2 || data.offers.length > 100 || !Array.isArray(data.rows) || data.rows.length > 2_000) fail();
  const insuranceType = data.version === 1 ? "" : text(data.insuranceType, 30);
  if (insuranceType && !INSURANCE_TYPES.some(type => type.id === insuranceType)) fail();
  const ids = new Set<string>();
  const offers = (data.offers as unknown[]).map(value => {
    const offer = record(value); const id = text(offer.id, 100);
    if (!/^[\w-]+$/.test(id) || ["__proto__", "constructor", "prototype"].includes(id) || ids.has(id)) fail();
    ids.add(id);
    const insurerId = text(offer.insurerId, 100);
    if (insurerId && insurerId !== "custom" && !insurerById(insurerId)) fail();
    return { id, label: text(offer.label, 80), insurerId, customInsurer: text(offer.customInsurer, 120), product: text(offer.product, 160), year: text(offer.year, 40), premium: text(offer.premium, 100), note: text(offer.note) };
  });
  const rowIds = new Set<string>();
  const recommendedOfferId = data.recommendedOfferId === undefined ? undefined : text(data.recommendedOfferId, 100);
  if (recommendedOfferId !== undefined && !offers.slice(1).some(offer => offer.id === recommendedOfferId)) fail();
  const rows = (data.rows as unknown[]).map(value => {
    const row = record(value); const source = record(row.cells); const id = text(row.id, 100);
    if (!id || rowIds.has(id) || !["item", "section"].includes(String(row.kind)) || !COMPARISON_ICONS.some(icon => icon.id === row.icon)) fail();
    rowIds.add(id);
    const coverage = data.version === 2 && row.coverage !== undefined ? text(row.coverage, 30) as CoverageKind : undefined;
    if (coverage !== undefined && (row.kind !== "item" || !ALL_COVERAGES.some(item => item.id === coverage))) fail();
    const cells = Object.fromEntries(offers.map(offer => {
      const cell = record(source[offer.id]);
      if (!TONES.some(tone => tone.id === cell.tone)) fail();
      if (!coverage && data.version === 2 && cell.details !== undefined) fail();
      return [offer.id, { text: text(cell.text), tone: cell.tone as CellTone, ...(coverage ? { details: parseCoverageDetails(cell.details, coverage) } : {}) }];
    }));
    return { id, kind: row.kind as ComparisonRow["kind"], label: text(row.label, 2_000), icon: row.icon as string, ...(coverage ? { coverage } : {}), cells };
  });
  const date = text(data.date, 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) fail();
  return { version: 2, insuranceType: insuranceType as InsuranceType, title: text(data.title, 120), firstName: text(data.firstName, 100), lastName: text(data.lastName, 100), date, introduction: text(data.introduction), offers, ...(recommendedOfferId !== undefined ? { recommendedOfferId } : {}), rows, notesTitle: text(data.notesTitle, 120), notes: text(data.notes) };
}
