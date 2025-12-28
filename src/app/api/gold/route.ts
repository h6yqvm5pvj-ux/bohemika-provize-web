// src/app/api/gold/route.ts
import { NextResponse } from "next/server";

export const revalidate = 60;
export const runtime = "nodejs";

// jednoduchá in-memory poslední známá hodnota (přežije v rámci jedné instance)
let lastOk: { usdPerOz: number; usdCzk: number; czkPerOz: number; ts: number } | null = null;

// jednoduchá in-memory cache pro historické výpočty (šetří stooq)
let lastHistory:
  | {
      czkSeries: DailyPoint[]; // CZK / unce (denní body)
      changesPct: { "1y": number; "2y": number; "3y": number; "5y": number; "10y": number };
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
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

async function fetchStooqDaily(symbol: string): Promise<DailyPoint[]> {
  // Stooq CSV: Date,Open,High,Low,Close,Volume
  // Příklad: https://stooq.com/q/d/l/?s=xauusd&i=d
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d`;
  const txt = await fetchText(url);

  const lines = txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // header + data
  if (lines.length < 2) return [];

  const out: DailyPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;

    const date = parts[0];
    const close = Number(parts[4]);

    // Stooq někdy vrací `N/A`
    if (!date || !Number.isFinite(close) || close <= 0) continue;

    out.push({ date, close });
  }

  // jistota seřazení podle data
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

type DailyPoint = { date: string; close: number };

type HistoryPoint = { t: number; v: number }; // t=ms timestamp, v=CZK/oz

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rangeToDays(range: string | null): number | null {
  if (!range) return null;
  const r = range.toLowerCase();
  if (r === "1w" || r === "7d" || r === "week") return 7;
  if (r === "3m" || r === "90d" || r === "3mo") return 92;
  if (r === "1y" || r === "1r" || r === "rok") return 365;
  if (r === "2y") return 730;
  if (r === "3y") return 1095;
  if (r === "5y") return 1826;
  if (r === "10y") return 3652;
  return null;
}

function buildHistoryPointsFromCzkSeries(czkSeries: DailyPoint[], days: number): HistoryPoint[] {
  if (!czkSeries.length) return [];

  const latest = czkSeries[czkSeries.length - 1];
  const latestDate = new Date(latest.date + "T00:00:00Z");
  const cutoff = new Date(latestDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffYmd = toYmd(cutoff);

  let points = czkSeries
    .filter((p) => p.date >= cutoffYmd)
    .map((p) => ({ t: Date.parse(p.date + "T00:00:00Z"), v: round2(p.close) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0);

  // downsample, aby to bylo svižné i na 10 let
  const MAX_POINTS = 1200;
  if (points.length > MAX_POINTS) {
    const step = Math.ceil(points.length / MAX_POINTS);
    points = points.filter((_, idx) => idx % step === 0);
  }

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
      changesPct: { "1y": number; "2y": number; "3y": number; "5y": number; "10y": number };
      asOfDate: string;
    }
  | null
> {
  // Cache: refetch max jednou za 6 hodin
  if (lastHistory && Date.now() - lastHistory.ts < 6 * 60 * 60 * 1000) {
    return {
      czkSeries: lastHistory.czkSeries,
      changesPct: lastHistory.changesPct,
      asOfDate: lastHistory.asOfDate,
    };
  }

  // Stooq symboly: xauusd (USD/oz), usdczk (FX)
  const [xauusd, usdczk] = await Promise.all([fetchStooqDaily("xauusd"), fetchStooqDaily("usdczk")]);
  if (!xauusd.length || !usdczk.length) return null;

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
  const t1 = toYmd(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  const t2 = toYmd(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()));
  const t3 = toYmd(new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()));
  const t5 = toYmd(new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()));
  const t10 = toYmd(new Date(now.getFullYear() - 10, now.getMonth(), now.getDate()));

  const p1 = findClosestOnOrBefore(czkSeries, t1);
  const p2 = findClosestOnOrBefore(czkSeries, t2);
  const p3 = findClosestOnOrBefore(czkSeries, t3);
  const p5 = findClosestOnOrBefore(czkSeries, t5);
  const p10 = findClosestOnOrBefore(czkSeries, t10);

  if (!p1 || !p2 || !p3 || !p5 || !p10) return null;

  const changesPct = {
    "1y": pctChange(latest.close, p1.close),
    "2y": pctChange(latest.close, p2.close),
    "3y": pctChange(latest.close, p3.close),
    "5y": pctChange(latest.close, p5.close),
    "10y": pctChange(latest.close, p10.close),
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

  throw new Error("Nepodařilo se načíst spot cenu zlata (USD/oz). Zkus to prosím později.");
}

async function fetchUsdCzk(): Promise<number> {
  const url =
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
  const j: any = await fetchJson(url);
  const rate = Number(j?.usd?.czk);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Kurz USD/CZK je neplatný.");
  return rate;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const daysParam = url.searchParams.get("days");
    const rangeParam = url.searchParams.get("range");

    const daysFromRange = rangeToDays(rangeParam);
    const daysFromParam = daysParam ? Number.parseInt(daysParam, 10) : NaN;

    // default: 3 roky (aby graf hned dával smysl)
    const days = clamp(
      Number.isFinite(daysFromParam) ? daysFromParam : daysFromRange ?? 1095,
      7,
      3652
    );

    const [usdPerOz, usdCzk, histAll] = await Promise.all([
      fetchGoldUsdPerOz(),
      fetchUsdCzk(),
      computeGoldCzkSeriesAndChanges().catch(() => null),
    ]);

    const czkPerOz = usdPerOz * usdCzk;
    lastOk = { usdPerOz, usdCzk, czkPerOz, ts: Date.now() };

    const history = histAll?.czkSeries ? buildHistoryPointsFromCzkSeries(histAll.czkSeries, days) : [];

    return NextResponse.json({
      ok: true,
      ...lastOk,
      // percent změny jsou vždy v CZK/oz (nezávisle na UI jednotkách)
      ...(histAll ? { changesPct: histAll.changesPct, asOfDate: histAll.asOfDate } : {}),
      history, // denní (downsampled) CZK/oz body pro graf
      historyDays: days,
    });
  } catch (err: any) {
    // fallback: poslední úspěšná hodnota (pokud existuje)
    if (lastOk) {
      const histAll = await computeGoldCzkSeriesAndChanges().catch(() => null);
      const history = histAll?.czkSeries ? buildHistoryPointsFromCzkSeries(histAll.czkSeries, 1095) : [];

      return NextResponse.json({
        ok: true,
        ...lastOk,
        stale: true,
        ...(histAll ? { changesPct: histAll.changesPct, asOfDate: histAll.asOfDate } : {}),
        history,
        historyDays: 1095,
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