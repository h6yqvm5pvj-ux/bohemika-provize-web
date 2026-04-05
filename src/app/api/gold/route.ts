// src/app/api/gold/route.ts
import { NextResponse } from "next/server";

export const revalidate = 60;
export const runtime = "nodejs";

// jednoduchá in-memory poslední známá hodnota (přežije v rámci jedné instance)
let lastOk: { usdPerOz: number; usdCzk: number; czkPerOz: number; ts: number } | null = null;

// jednoduchá in-memory cache pro historické výpočty (šetří stooq)
type ChangesPct = {
  "1d": number | null;
  "3m": number | null;
  "1y": number | null;
  "2y": number | null;
  "3y": number | null;
  "5y": number | null;
  "10y": number | null;
};

let lastHistory:
  | {
      czkSeries: DailyPoint[]; // CZK / unce (denní body)
      changesPct: ChangesPct;
      asOfDate: string;
      ts: number;
    }
  | null = null;

async function fetchJson(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);

  try {
    const r = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Bohemika.App/1.0",
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function toYmd(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchText(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);

  try {
    const r = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        Accept: "text/plain,*/*",
        "User-Agent": "Bohemika.App/1.0",
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function parseLooseNumber(value: string): number {
  const raw = String(value ?? "")
    .trim()
    .replace(/["']/g, "")
    .replace(/\s+/g, "");
  if (!raw || /^n\/?a$/i.test(raw) || raw === "-") return NaN;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const normalized =
      lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    return Number(normalized);
  }

  if (hasComma) {
    // pokud to vypadá jako desetinná čárka, převeď ji na tečku
    const normalized = /,\d{1,4}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
    return Number(normalized);
  }

  return Number(raw);
}

function normalizeYmd(value: string): string | null {
  const raw = String(value ?? "").trim().replace(/["']/g, "");
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) return raw.replaceAll("/", "-");

  const dmy = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return toYmd(new Date(parsed));
}

function dedupeAndSortDaily(points: DailyPoint[]): DailyPoint[] {
  if (!points.length) return [];

  const map = new Map<string, number>();
  for (const p of points) {
    if (!p?.date || !Number.isFinite(p?.close) || p.close <= 0) continue;
    map.set(p.date, p.close);
  }

  return [...map.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function parseDailyCsv(text: string): DailyPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  if (
    !header.includes("date") &&
    !header.includes("data") &&
    !header.includes("close") &&
    !header.includes("zamkniecie")
  ) {
    return [];
  }

  const delimiter = header.includes(";") ? ";" : ",";
  const out: DailyPoint[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter).map((p) => p.trim());
    if (parts.length < 5) continue;

    const date = normalizeYmd(parts[0]);
    const close = parseLooseNumber(parts[4]);
    if (!date || !Number.isFinite(close) || close <= 0) continue;

    out.push({ date, close });
  }

  return dedupeAndSortDaily(out);
}

async function fetchStooqDaily(symbol: string): Promise<DailyPoint[]> {
  const s = encodeURIComponent(symbol.toLowerCase());
  const urls = [
    `https://stooq.com/q/d/l/?s=${s}&i=d`,
    `https://stooq.pl/q/d/l/?s=${s}&i=d`,
  ];

  for (const url of urls) {
    try {
      const txt = await fetchText(url);
      const parsed = parseDailyCsv(txt);
      if (parsed.length >= 2) return parsed;
    } catch {
      // zkusíme další variantu URL
    }
  }

  return [];
}

type DailyPoint = { date: string; close: number };
type IntradayPoint = { t: number; close: number }; // t=unix seconds (UTC)

type HistoryPoint = { t: number; v: number }; // t=unix seconds (UTC), v=CZK/oz

const DAY_MS = 24 * 60 * 60 * 1000;

function seriesSpanDays(series: DailyPoint[]): number {
  if (series.length < 2) return 0;
  const first = Date.parse(`${series[0].date}T00:00:00Z`);
  const last = Date.parse(`${series[series.length - 1].date}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return 0;
  return (last - first) / DAY_MS;
}

function pointsPerMonth(series: DailyPoint[]): number {
  if (!series.length) return 0;
  const spanDays = seriesSpanDays(series);
  if (spanDays <= 0) return series.length;
  return series.length / Math.max(1, spanDays / 30);
}

function isSeriesTooSparse(series: DailyPoint[]): boolean {
  if (series.length < 3) return true;
  return pointsPerMonth(series) < 3;
}

function pairScore(xauusd: DailyPoint[], usdczk: DailyPoint[]): number {
  if (xauusd.length < 2 || usdczk.length < 2) return -1;
  return Math.min(xauusd.length, usdczk.length) + (pointsPerMonth(xauusd) + pointsPerMonth(usdczk)) * 50;
}

function pickBestPair(
  pairs: Array<{ xauusd: DailyPoint[]; usdczk: DailyPoint[] }>
): { xauusd: DailyPoint[]; usdczk: DailyPoint[] } | null {
  let best: { xauusd: DailyPoint[]; usdczk: DailyPoint[] } | null = null;
  let bestScore = -1;

  for (const pair of pairs) {
    const score = pairScore(pair.xauusd, pair.usdczk);
    if (score > bestScore) {
      best = pair;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : null;
}

async function fetchYahooDaily(symbol: string): Promise<DailyPoint[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    "?range=10y&interval=1d&events=history&includeAdjustedClose=true";

  const j: any = await fetchJson(url);
  const result = j?.chart?.result?.[0];
  const timestamps: any[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes: any[] = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];

  if (!timestamps.length || !closes.length) return [];

  const out: DailyPoint[] = [];
  const n = Math.min(timestamps.length, closes.length);
  for (let i = 0; i < n; i++) {
    const ts = Number(timestamps[i]);
    const close = Number(closes[i]);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    if (!Number.isFinite(close) || close <= 0) continue;

    out.push({ date: toYmd(new Date(ts * 1000)), close });
  }

  return dedupeAndSortDaily(out);
}

function dedupeAndSortIntraday(points: IntradayPoint[]): IntradayPoint[] {
  if (!points.length) return [];

  const map = new Map<number, number>();
  for (const p of points) {
    if (!Number.isFinite(p?.t) || p.t <= 0) continue;
    if (!Number.isFinite(p?.close) || p.close <= 0) continue;
    map.set(Math.round(p.t), p.close);
  }

  return [...map.entries()]
    .map(([t, close]) => ({ t, close }))
    .sort((a, b) => a.t - b.t);
}

async function fetchYahooIntraday(symbol: string, range = "7d", interval = "1h"): Promise<IntradayPoint[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true&events=history`;

  const j: any = await fetchJson(url);
  const result = j?.chart?.result?.[0];
  const timestamps: any[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes: any[] = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];

  if (!timestamps.length || !closes.length) return [];

  const out: IntradayPoint[] = [];
  const n = Math.min(timestamps.length, closes.length);
  for (let i = 0; i < n; i++) {
    const ts = Number(timestamps[i]);
    const close = Number(closes[i]);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    if (!Number.isFinite(close) || close <= 0) continue;
    out.push({ t: Math.round(ts), close });
  }

  return dedupeAndSortIntraday(out);
}

async function fetchLbmaGoldUsdDaily(): Promise<DailyPoint[]> {
  const j: any = await fetchJson("https://prices.lbma.org.uk/json/gold_am.json");
  if (!Array.isArray(j)) return [];

  const out: DailyPoint[] = [];
  for (const row of j) {
    const date = normalizeYmd(String(row?.d ?? ""));
    const vals = Array.isArray(row?.v) ? row.v : [];
    const close =
      vals
        .map((v: any) => Number(v))
        .find((v: number) => Number.isFinite(v) && v > 0) ?? NaN;

    if (!date || !Number.isFinite(close) || close <= 0) continue;
    out.push({ date, close });
  }

  return dedupeAndSortDaily(out);
}

async function fetchFrankfurterUsdCzkDaily(): Promise<DailyPoint[]> {
  const end = toYmd(new Date());
  const start = toYmd(new Date(Date.now() - 3652 * DAY_MS)); // cca 10 let
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=CZK`;
  const j: any = await fetchJson(url);
  const rates = j?.rates;
  if (!rates || typeof rates !== "object") return [];

  const out: DailyPoint[] = [];
  for (const [dateRaw, payload] of Object.entries(rates as Record<string, any>)) {
    const date = normalizeYmd(dateRaw);
    const close = Number((payload as any)?.CZK);
    if (!date || !Number.isFinite(close) || close <= 0) continue;
    out.push({ date, close });
  }

  return dedupeAndSortDaily(out);
}

function pickSeries(primary: DailyPoint[], fallback: DailyPoint[]): DailyPoint[] {
  if (primary.length >= 20) return primary;
  if (fallback.length >= 2) return fallback;
  return primary.length ? primary : fallback;
}

async function fetchHistoricalInputs(): Promise<{ xauusd: DailyPoint[]; usdczk: DailyPoint[] } | null> {
  const [stooqGold, stooqFx] = await Promise.all([fetchStooqDaily("xauusd"), fetchStooqDaily("usdczk")]);
  if (stooqGold.length >= 20 && stooqFx.length >= 20 && !isSeriesTooSparse(stooqGold)) {
    return { xauusd: stooqGold, usdczk: stooqFx };
  }

  const [lbmaGold, frankfurterFx] = await Promise.all([
    fetchLbmaGoldUsdDaily().catch(() => []),
    fetchFrankfurterUsdCzkDaily().catch(() => []),
  ]);

  const densePair = pickBestPair([
    { xauusd: lbmaGold, usdczk: frankfurterFx },
    { xauusd: lbmaGold, usdczk: stooqFx },
    { xauusd: stooqGold, usdczk: frankfurterFx },
    { xauusd: stooqGold, usdczk: stooqFx },
  ]);
  if (densePair && !isSeriesTooSparse(densePair.xauusd)) return densePair;

  const [yahooGold, yahooUsdCzk, yahooCzkUsd] = await Promise.all([
    fetchYahooDaily("GC=F").catch(() => []),
    fetchYahooDaily("USDCZK=X").catch(() => []),
    fetchYahooDaily("CZK=X").catch(() => []),
  ]);

  const invertedCzkUsd = yahooCzkUsd
    .map((p) => (p.close > 0 ? { date: p.date, close: 1 / p.close } : null))
    .filter((p): p is DailyPoint => Boolean(p && Number.isFinite(p.close) && p.close > 0));

  const fxYahoo = yahooUsdCzk.length >= 2 ? yahooUsdCzk : invertedCzkUsd;

  const xauusd = pickSeries(densePair?.xauusd ?? stooqGold, yahooGold);
  const usdczk = pickSeries(densePair?.usdczk ?? stooqFx, fxYahoo);

  if (!xauusd.length || !usdczk.length) return null;
  return { xauusd, usdczk };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isMaxRange(range: string | null): boolean {
  if (!range) return false;
  const r = range.toLowerCase();
  return r === "max" || r === "all";
}

function rangeToDays(range: string | null): number | null {
  if (!range) return null;
  const r = range.toLowerCase();
  if (r === "w1" || r === "1w" || r === "7d" || r === "week") return 7;
  if (r === "m3" || r === "3m" || r === "90d" || r === "3mo") return 92;
  if (r === "y1" || r === "1y" || r === "1r" || r === "rok") return 365;
  if (r === "y2" || r === "2y") return 730;
  if (r === "y3" || r === "3y") return 1095;
  if (r === "y5" || r === "5y") return 1826;
  if (r === "y10" || r === "10y") return 3652;
  return null;
}

function invertIntradaySeries(series: IntradayPoint[]): IntradayPoint[] {
  return dedupeAndSortIntraday(
    series
      .map((p) => (p.close > 0 ? { t: p.t, close: 1 / p.close } : null))
      .filter((p): p is IntradayPoint => Boolean(p && Number.isFinite(p.close) && p.close > 0))
  );
}

async function fetchW1IntradayGoldCzkSeries(): Promise<HistoryPoint[] | null> {
  const [xauusd, usdczk, czkusd] = await Promise.all([
    fetchYahooIntraday("GC=F", "7d", "1h").catch(() => []),
    fetchYahooIntraday("USDCZK=X", "7d", "1h").catch(() => []),
    fetchYahooIntraday("CZK=X", "7d", "1h").catch(() => []),
  ]);

  const fxSeries = usdczk.length >= 8 ? usdczk : invertIntradaySeries(czkusd);
  if (xauusd.length < 8 || fxSeries.length < 8) return null;

  const out: HistoryPoint[] = [];

  let fxIdx = 0;
  let lastFx: number | null = null;

  for (const g of xauusd) {
    while (fxIdx < fxSeries.length && fxSeries[fxIdx].t <= g.t) {
      const v = fxSeries[fxIdx].close;
      if (Number.isFinite(v) && v > 0) lastFx = v;
      fxIdx++;
    }

    const fx = lastFx;
    if (!fx || !Number.isFinite(fx) || fx <= 0) continue;
    if (!Number.isFinite(g.close) || g.close <= 0) continue;

    out.push({ t: g.t, v: round2(g.close * fx) });
  }

  const points = out.sort((a, b) => a.t - b.t);
  return points.length >= 8 ? points : null;
}

function buildHistoryPointsFromCzkSeries(czkSeries: DailyPoint[], days: number | null): HistoryPoint[] {
  if (!czkSeries.length) return [];

  let points: HistoryPoint[] = [];

  const toUnixSeconds = (ymd: string) => Math.floor(Date.parse(ymd + "T00:00:00Z") / 1000);

  // MAX / ALL: vezmeme celou dostupnou historii
  if (days == null || !Number.isFinite(days)) {
    points = czkSeries
      .map((p) => ({ t: toUnixSeconds(p.date), v: round2(p.close) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0);
  } else {
    const latest = czkSeries[czkSeries.length - 1];
    const latestDate = new Date(latest.date + "T00:00:00Z");
    const cutoff = new Date(latestDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffYmd = toYmd(cutoff);

    points = czkSeries
      .filter((p) => p.date >= cutoffYmd)
      .map((p) => ({ t: toUnixSeconds(p.date), v: round2(p.close) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0);
  }

  // downsample, aby to bylo svižné i na MAX
  const MAX_POINTS = 1200;
  if (points.length > MAX_POINTS) {
    const step = Math.ceil(points.length / MAX_POINTS);
    const down = points.filter((_, idx) => idx % step === 0);
    // zajisti, že poslední bod (nejnovější) zůstane vždy v datech
    const last = points[points.length - 1];
    if (!down.length || down[down.length - 1].t !== last.t) down.push(last);
    points = down;
  }

  // jistota řazení podle času
  points.sort((a, b) => a.t - b.t);

  return points;
}

function findClosestOnOrBefore(series: DailyPoint[], ymd: string): DailyPoint | null {
  // series je typicky seřazená vzestupně podle data
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].date <= ymd) return series[i];
  }
  return series.length ? series[0] : null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function pctChange(latest: number, past: number) {
  return round2(((latest / past) - 1) * 100);
}

async function computeGoldCzkSeriesAndChanges(): Promise<
  | {
      czkSeries: DailyPoint[];
      changesPct: ChangesPct;
      asOfDate: string;
    }
  | null
> {
  // Cache: refetch max jednou za 6 hodin
  // Pokud je cache příliš řídká (typicky měsíční body), radši ji ignorujeme.
  if (
    lastHistory &&
    Date.now() - lastHistory.ts < 6 * 60 * 60 * 1000 &&
    !isSeriesTooSparse(lastHistory.czkSeries)
  ) {
    return {
      czkSeries: lastHistory.czkSeries,
      changesPct: lastHistory.changesPct,
      asOfDate: lastHistory.asOfDate,
    };
  }

  const inputs = await fetchHistoricalInputs();
  if (!inputs) return null;
  const { xauusd, usdczk } = inputs;

  // CZK/oz = XAUUSD (USD/oz) * USDCZK (CZK/USD)
  // FX u víkendů typicky chybí → použijeme poslední známý kurz před daným dnem.
  const czkSeries: DailyPoint[] = [];

  let fxIdx = 0;
  let lastFx: number | null = null;

  for (const g of xauusd) {
    while (fxIdx < usdczk.length && usdczk[fxIdx].date <= g.date) {
      const v = usdczk[fxIdx].close;
      if (Number.isFinite(v) && v > 0) lastFx = v;
      fxIdx++;
    }

    const fx = lastFx;
    if (!fx || !Number.isFinite(fx) || fx <= 0) continue;
    if (!Number.isFinite(g.close) || g.close <= 0) continue;

    czkSeries.push({ date: g.date, close: g.close * fx });
  }

  if (!czkSeries.length) return null;

  const latest = czkSeries[czkSeries.length - 1];

  const now = new Date(latest.date + "T00:00:00Z");

  // 3 měsíce zpět (kalendářně)
  const now3m = new Date(now);
  now3m.setUTCMonth(now3m.getUTCMonth() - 3);
  const t3m = toYmd(now3m);

  const t1 = toYmd(new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())));
  const t2 = toYmd(new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate())));
  const t3 = toYmd(new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), now.getUTCDate())));
  const t5 = toYmd(new Date(Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate())));
  const t10 = toYmd(new Date(Date.UTC(now.getUTCFullYear() - 10, now.getUTCMonth(), now.getUTCDate())));

  const p3m = findClosestOnOrBefore(czkSeries, t3m);
  const p1 = findClosestOnOrBefore(czkSeries, t1);
  const p2 = findClosestOnOrBefore(czkSeries, t2);
  const p3 = findClosestOnOrBefore(czkSeries, t3);
  const p5 = findClosestOnOrBefore(czkSeries, t5);
  const p10 = findClosestOnOrBefore(czkSeries, t10);

  // 1d = změna proti předchozímu dostupnému dni (typicky včerejšek; o víkendu pátek)
  const prevDay = czkSeries.length >= 2 ? czkSeries[czkSeries.length - 2] : null;

  const safePct = (past: DailyPoint | null) => {
    if (!past || !Number.isFinite(past.close) || past.close <= 0) return null;
    return pctChange(latest.close, past.close);
  };

  const changesPct = {
    "1d": safePct(prevDay),
    "3m": safePct(p3m),
    "1y": safePct(p1),
    "2y": safePct(p2),
    "3y": safePct(p3),
    "5y": safePct(p5),
    "10y": safePct(p10),
  };

  lastHistory = { czkSeries, changesPct, asOfDate: latest.date, ts: Date.now() };

  return { czkSeries, changesPct, asOfDate: latest.date };
}

async function fetchGoldUsdPerOz(): Promise<number> {
  // ✅ Stabilnější veřejný zdroj (USD/oz)
  // Vrací např. { items: [{ xauPrice: <USD per oz>, ... }], ... }
  const primaryUrl = "https://data-asg.goldprice.org/dbXRates/USD";

  try {
    const j: any = await fetchJson(primaryUrl);
    const p = Number(j?.items?.[0]?.xauPrice);
    if (Number.isFinite(p) && p > 0) return p;
  } catch {
    // ignore and try fallbacks
  }

  // Fallback: gold-api.com (vrací např. { price: 1234.56, symbol: "XAU" })
  try {
    const j: any = await fetchJson("https://api.gold-api.com/price/XAU");
    const p = Number(j?.price ?? j?.xauPrice ?? j?.data?.price);
    if (Number.isFinite(p) && p > 0) return p;
  } catch {
    // ignore and continue
  }

  // Fallback: metals.live (někdy padá na TLS / dočasně nedostupné)
  const tryUrls = [
    "https://api.metals.live/v1/spot/gold",
    "https://api.metals.live/v1/spot",
  ];

  for (const url of tryUrls) {
    try {
      const j: any = await fetchJson(url);

      if (Array.isArray(j)) {
        const first = j[0];

        if (Array.isArray(first)) {
          const p = Number(first?.[1]);
          if (Number.isFinite(p) && p > 0) return p;
        }

        const goldRow = j.find(
          (x: any) => Array.isArray(x) && String(x?.[0]).toLowerCase() === "gold"
        );
        if (goldRow) {
          const p = Number(goldRow?.[1]);
          if (Number.isFinite(p) && p > 0) return p;
        }

        const obj0 = j[0];
        if (obj0 && typeof obj0 === "object" && !Array.isArray(obj0)) {
          const p = Number(obj0?.gold ?? obj0?.XAU ?? obj0?.price);
          if (Number.isFinite(p) && p > 0) return p;
        }
      }
    } catch {
      // ignore and continue
    }
  }

  // Poslední fallback: denní close ze Stooq (může být zpožděné, ale drží UI živé).
  try {
    const xauusd = await fetchStooqDaily("xauusd");
    const last = xauusd[xauusd.length - 1];
    const p = Number(last?.close);
    if (Number.isFinite(p) && p > 0) return p;
  } catch {
    // ignore and fail below
  }

  throw new Error("Nepodařilo se načíst spot cenu zlata (USD/oz). Zkus to prosím později.");
}

async function fetchUsdCzk(): Promise<number> {
  // Primární zdroj
  try {
    const url =
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
    const j: any = await fetchJson(url);
    const rate = Number(j?.usd?.czk);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {
    // ignore and try fallbacks
  }

  // Fallback: Frankfurter
  try {
    const j: any = await fetchJson("https://api.frankfurter.app/latest?from=USD&to=CZK");
    const rate = Number(j?.rates?.CZK);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {
    // ignore and continue
  }

  // Poslední fallback: denní close ze Stooq
  try {
    const usdczk = await fetchStooqDaily("usdczk");
    const last = usdczk[usdczk.length - 1];
    const rate = Number(last?.close);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {
    // ignore and fail below
  }

  throw new Error("Kurz USD/CZK je neplatný nebo dočasně nedostupný.");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const daysParam = url.searchParams.get("days");
    const rangeParam = url.searchParams.get("range");

    const daysFromParam = daysParam ? Number.parseInt(daysParam, 10) : NaN;

    // MAX může přijít buď přes `range=max|all`, nebo některé UI posílá extrémně vysoké `days`
    const maxMode = isMaxRange(rangeParam) || (Number.isFinite(daysFromParam) && daysFromParam >= 3652 * 2);

    const daysFromRange = maxMode ? null : rangeToDays(rangeParam);

    // default: 3 roky (aby graf hned dával smysl)
    // Pozn.: 10 let je limit pouze pro "ne-MAX" režimy, aby graf zůstal svižný.
    const days = maxMode
      ? null
      : clamp(Number.isFinite(daysFromParam) ? daysFromParam : daysFromRange ?? 1095, 7, 3652);

    const useW1Intraday = !maxMode && days === 7;

    const [usdPerOz, usdCzk, histAll, intradayW1] = await Promise.all([
      fetchGoldUsdPerOz(),
      fetchUsdCzk(),
      computeGoldCzkSeriesAndChanges().catch(() => null),
      useW1Intraday ? fetchW1IntradayGoldCzkSeries().catch(() => null) : Promise.resolve(null),
    ]);

    const czkPerOz = usdPerOz * usdCzk;
    lastOk = { usdPerOz, usdCzk, czkPerOz, ts: Date.now() };

    const history =
      intradayW1 && intradayW1.length
        ? intradayW1
        : histAll?.czkSeries
          ? buildHistoryPointsFromCzkSeries(histAll.czkSeries, days)
          : [];
    const historyGranularity = intradayW1 && intradayW1.length ? "intraday-1h" : "daily-1d";

    return NextResponse.json({
      ok: true,
      ...lastOk,
      // percent změny jsou vždy v CZK/oz (nezávisle na UI jednotkách)
      ...(histAll ? { changesPct: histAll.changesPct, asOfDate: histAll.asOfDate } : {}),
      history, // intraday (w1) nebo denní (ostatní range) body pro graf
      historyDays: days ?? null,
      historyMax: maxMode,
      historyGranularity,
    });
  } catch (err: any) {
    // fallback: poslední úspěšná hodnota (pokud existuje)
    if (lastOk) {
      const fallbackUrl = new URL(req.url);
      const fallbackRange = fallbackUrl.searchParams.get("range");
      const fallbackDaysParam = fallbackUrl.searchParams.get("days");
      const fallbackDaysFromParam = fallbackDaysParam ? Number.parseInt(fallbackDaysParam, 10) : NaN;

      const fallbackMax =
        isMaxRange(fallbackRange) || (Number.isFinite(fallbackDaysFromParam) && fallbackDaysFromParam >= 3652 * 2);
      const fallbackDaysFromRange = fallbackMax ? null : rangeToDays(fallbackRange);
      const fallbackDays = fallbackMax
        ? null
        : clamp(
            Number.isFinite(fallbackDaysFromParam) ? fallbackDaysFromParam : fallbackDaysFromRange ?? 1095,
            7,
            3652
          );
      const fallbackUseW1Intraday = !fallbackMax && fallbackDays === 7;

      const [histAll, fallbackIntradayW1] = await Promise.all([
        computeGoldCzkSeriesAndChanges().catch(() => null),
        fallbackUseW1Intraday ? fetchW1IntradayGoldCzkSeries().catch(() => null) : Promise.resolve(null),
      ]);
      const history =
        fallbackIntradayW1 && fallbackIntradayW1.length
          ? fallbackIntradayW1
          : histAll?.czkSeries
            ? buildHistoryPointsFromCzkSeries(histAll.czkSeries, fallbackDays)
            : [];
      const historyGranularity =
        fallbackIntradayW1 && fallbackIntradayW1.length ? "intraday-1h" : "daily-1d";

      return NextResponse.json({
        ok: true,
        ...lastOk,
        stale: true,
        ...(histAll ? { changesPct: histAll.changesPct, asOfDate: histAll.asOfDate } : {}),
        history,
        historyDays: fallbackDays ?? null,
        historyMax: fallbackMax,
        historyGranularity,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: String(err?.message || "fetch failed"),
        cause: String(err?.cause?.message || err?.cause || ""),
      },
      { status: 500 }
    );
  }
}
