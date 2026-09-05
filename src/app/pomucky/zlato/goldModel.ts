export const OUNCE_G = 31.1034768;
export type GoldPoint = { t: number; v: number };

export function parseGoldAmount(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function convertGoldAmount(amount: number | null, pricePerOz: number | null, mode: "grams" | "budget") {
  if (amount == null || pricePerOz == null || !Number.isFinite(amount) || !Number.isFinite(pricePerOz) || amount < 0 || pricePerOz <= 0) return null;
  const perGram = pricePerOz / OUNCE_G;
  const grams = mode === "grams" ? amount : amount / perGram;
  const czk = mode === "budget" ? amount : amount * perGram;
  return Number.isFinite(grams) && Number.isFinite(czk) ? { grams, czk } : null;
}

export function normalizeGoldPoints(points: GoldPoint[]): GoldPoint[] {
  const byTime = new Map<number, GoldPoint>();
  for (const point of points) {
    if (Number.isFinite(point.t) && Number.isFinite(point.v) && point.v > 0 && !Number.isNaN(new Date(point.t).getTime())) byTime.set(point.t, point);
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function summarizeGoldPoints(points: GoldPoint[]) {
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return {
    first, last,
    min: points.reduce((a, b) => b.v < a.v ? b : a),
    max: points.reduce((a, b) => b.v > a.v ? b : a),
    change: (last.v / first.v - 1) * 100,
  };
}

export function goldHistoryCsv(points: GoldPoint[], unitLabel: string): string {
  const rows = normalizeGoldPoints(points).map(p => `${new Date(p.t).toISOString()};${p.v.toFixed(2).replace(".", ",")}`);
  return `\uFEFFDatum (UTC);Cena v Kč / ${unitLabel}\r\n${rows.join("\r\n")}`;
}

export function goldMoney(value: number) {
  return `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
}
