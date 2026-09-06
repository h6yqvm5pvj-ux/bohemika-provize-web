export type PropertyMeasure = "footprint" | "land" | "floors" | "apartments";
export type ParcelRow = { id?: number | string; parcela?: string; vymeraM2?: number; druh?: string; katUzemi?: string; lv?: string | number; typParcely?: string };
export type DateInsight = { key: string; label: string; date: Date; hint: string; tone: "fresh" | "normal" | "warning" };
export type PropertyMetric = { kind: PropertyMeasure; label: string; value: number | undefined; unit: string; explanation: string };

export function propertyNumber(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

export function propertyText(value: unknown): string {
  if (typeof value === "string") return value.trim() || "Neuvedeno";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object" && value !== null && "nazev" in value) return propertyText(value.nazev);
  return "Neuvedeno";
}

export function propertyMetrics(technical: Record<string, unknown> | null, parcels: ParcelRow[]): PropertyMetric[] {
  const row = technical ?? {};
  const areas = parcels.map(parcel => propertyNumber(parcel.vymeraM2));
  const landArea = areas.length && areas.every((area): area is number => area !== undefined) ? areas.reduce((sum, area) => sum + area, 0) : undefined;
  const count = (value: unknown) => { const number = propertyNumber(value); return number !== undefined && Number.isInteger(number) ? number : undefined; };
  return [
    { kind: "footprint", label: "Zastavěná plocha", value: propertyNumber(row.zastavenaplocha), unit: "m²", explanation: "Plocha, kterou stavba zabírá na zemi." },
    { kind: "land", label: "Výměra pozemků", value: landArea, unit: "m²", explanation: landArea === undefined ? "Součet není k dispozici. Výměry najdeš u jednotlivých parcel níže." : "Součet výměr načtených parcel spojených se stavbou." },
    { kind: "floors", label: "Počet podlaží", value: count(row.pocetpodlazi), unit: "", explanation: "Počet podlaží uvedený ve stavebním objektu RÚIAN." },
    { kind: "apartments", label: "Počet bytů", value: count(row.pocetbytu), unit: "", explanation: "Počet bytů evidovaný u této stavby." },
  ];
}

export const formatPropertyNumber = (value: number) => value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
