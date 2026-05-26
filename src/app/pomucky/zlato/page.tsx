// src/app/pomucky/zlato/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";

const OUNCE_G = 31.1034768; // trojská unce

type Point = { t: number; v: number }; // v = CZK / oz

type GoldApiResponse = {
  ok: boolean;
  usdPerOz?: number;
  usdCzk?: number;
  czkPerOz?: number;
  ts?: number;
  stale?: boolean;
  asOfDate?: string;

  // historická data (preferované)
  history?: Point[];

  // fallback historie (když backend vrací jiný tvar)
  czkSeries?: any[];

  changes?: {
    d1?: number;
    m3?: number;
    y1?: number;
    y2?: number;
    y3?: number;
    y5?: number;
    y10?: number;
  };
  changesPct?: {
    "1d"?: number;
    "3m"?: number;
    "1y"?: number;
    "2y"?: number;
    "3y"?: number;
    "5y"?: number;
    "10y"?: number;
  };
  message?: string;
  error?: string;
};

const UNITS = {
  g1: { label: "1 g", grams: 1 },
  g5: { label: "5 g", grams: 5 },
  g10: { label: "10 g", grams: 10 },
  g20: { label: "20 g", grams: 20 },
  oz: { label: "1 oz", grams: OUNCE_G },
  g50: { label: "50 g", grams: 50 },
  g100: { label: "100 g", grams: 100 },
  g250: { label: "250 g", grams: 250 },
  kg1: { label: "1 kg", grams: 1000 },
} as const;

const RANGES = {
  w1: { label: "1 týden", days: 7 },
  m3: { label: "3 měsíce", days: 92 },
  y1: { label: "1 rok", days: 366 },
  y3: { label: "3 roky", days: 3 * 366 },
  y5: { label: "5 let", days: 5 * 366 },
  y10: { label: "10 let", days: 10 * 366 },
  max: { label: "MAX", days: 30 * 366 },
} as const;

type UnitKey = keyof typeof UNITS;
type RangeKey = keyof typeof RANGES;
type GoldView = "movement" | "comfort";
type ComfortBrand = "argor" | "pamp";
type ComfortPriceKey = "argor-1oz" | "argor-20g" | "pamp-1oz";
type ComfortPriceMode = "spot-scaled" | "official";
type ComfortProductReference = {
  label: string;
  displayWeight: string;
  grams: number;
  sellCzk: number;
  buybackCzk: number;
  imageSrc: string;
  spotCzkPerOz?: number;
  priceMode?: ComfortPriceMode;
  priceKey?: ComfortPriceKey;
  asOf?: string;
};
type ComfortBrandReference = {
  label: string;
  cardLabel: string;
  asOf: string;
  spotCzkPerOz: number;
  purity: string;
  products: readonly ComfortProductReference[];
};
type ComfortLivePrice = {
  sellCzk: number | null;
  buybackCzk: number | null;
  productId: number;
  productLabel: string;
};
type ComfortPricesApiResponse = {
  ok: boolean;
  source?: "live" | "fallback";
  stale?: boolean;
  fetchedAt?: number;
  prices?: Partial<Record<ComfortPriceKey, ComfortLivePrice>>;
  message?: string;
  error?: string;
};

const COMFORT_BRAND_REFERENCES: Record<ComfortBrand, ComfortBrandReference> = {
  argor: {
    label: "ARGOR",
    cardLabel: "ARGOR HERAEUS",
    asOf: "2. 5. 2026",
    spotCzkPerOz: 95911.45,
    purity: "999.9 Au",
    products: [
      {
        label: "ARGOR 1 oz",
        displayWeight: "1 oZ",
        grams: OUNCE_G,
        sellCzk: 102197,
        buybackCzk: 95214,
        priceKey: "argor-1oz",
        imageSrc: "/icons/argor1OZ.png",
        spotCzkPerOz: 95911.45,
        priceMode: "official",
        asOf: "4. 5. 2026",
      },
      {
        label: "ARGOR 20 g",
        displayWeight: "20 g",
        grams: 20,
        sellCzk: 67951,
        buybackCzk: 62011,
        priceKey: "argor-20g",
        imageSrc: "/icons/argor20g.png",
        spotCzkPerOz: 95911.45,
        priceMode: "official",
      },
      {
        label: "ARGOR 5 g",
        displayWeight: "5 g",
        grams: 5,
        sellCzk: 18355,
        buybackCzk: 15622,
        imageSrc: "/icons/argor5g.png",
        spotCzkPerOz: 95911.45,
      },
      {
        label: "ARGOR 2 g",
        displayWeight: "2 g",
        grams: 2,
        sellCzk: 7447,
        buybackCzk: 6214,
        imageSrc: "/icons/argor2g.png",
        spotCzkPerOz: 95911.45,
      },
    ],
  },
  pamp: {
    label: "PAMP",
    cardLabel: "PAMP",
    asOf: "20. 4. 2026",
    spotCzkPerOz: 98810.8,
    purity: "999.9 Au",
    products: [
      {
        label: "PAMP 1 oz",
        displayWeight: "1 oZ",
        grams: OUNCE_G,
        sellCzk: 104277,
        buybackCzk: 95514,
        priceKey: "pamp-1oz",
        imageSrc: "/icons/1oZpredni.png",
        spotCzkPerOz: 98810.8,
        priceMode: "official",
        asOf: "4. 5. 2026",
      },
      {
        label: "PAMP 20 g",
        displayWeight: "20 g",
        grams: 20,
        sellCzk: 68812,
        buybackCzk: 62011,
        imageSrc: "/icons/pamp20g.png",
        spotCzkPerOz: 95911.45,
      },
      {
        label: "PAMP 5 g",
        displayWeight: "5 g",
        grams: 5,
        sellCzk: 18668,
        buybackCzk: 15622,
        imageSrc: "/icons/pamp5g.png",
        spotCzkPerOz: 95911.45,
      },
    ],
  },
};

function getDefaultComfortIndex(brand: ComfortBrand): number {
  const products = COMFORT_BRAND_REFERENCES[brand].products;
  const oneOzIndex = products.findIndex((product) => Math.abs(product.grams - OUNCE_G) < 0.001);
  return oneOzIndex >= 0 ? oneOzIndex : 0;
}

function downsamplePoints(pts: Point[], maxPoints = 1400): Point[] {
  if (!pts || pts.length <= maxPoints) return pts;
  const step = Math.ceil(pts.length / maxPoints);
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  const last = pts[pts.length - 1];
  if (out[out.length - 1]?.t !== last.t) out.push(last);
  return out;
}

function formatCzk(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (
    v.toLocaleString("cs-CZ", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function formatNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("cs-CZ", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function isWeekendDay(date = new Date()): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

async function fetchGold(input?: { days?: number; range?: RangeKey }): Promise<{
  usdPerOz: number;
  usdCzk: number;
  czkPerOz: number;
  ts: number;
  stale: boolean;
  asOfDate: string | null;
  history?: Point[];
  changes?: GoldApiResponse["changes"];
}> {
  const days = input?.days ?? 0;
  const range = input?.range;

  // Backend může podporovat buď `days`, nebo `range` – pošleme obojí.
  const qs = new URLSearchParams();
  if (days) qs.set("days", String(days));
  if (range) qs.set("range", String(range));

  const url = qs.toString() ? `/api/gold?${qs.toString()}` : "/api/gold";

  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as GoldApiResponse | null;

  if (!r.ok) {
    throw new Error(
      String(j?.message || j?.error || "Nepodařilo se načíst data o zlatě (API).")
    );
  }

  if (!j || j?.ok !== true) {
    throw new Error(String(j?.message || j?.error || "Nepodařilo se načíst data o zlatě."));
  }

  const usdPerOz = Number(j?.usdPerOz);
  const usdCzk = Number(j?.usdCzk);
  const czkPerOz = Number(j?.czkPerOz);
  const ts = Number(j?.ts || Date.now());

  if (!Number.isFinite(usdPerOz) || usdPerOz <= 0) throw new Error("Neplatná spot cena zlata.");
  if (!Number.isFinite(usdCzk) || usdCzk <= 0) throw new Error("Neplatný kurz USD/CZK.");
  if (!Number.isFinite(czkPerOz) || czkPerOz <= 0) throw new Error("Neplatná cena zlata v CZK.");

  const toTs = (x: any): number | null => {
    if (x == null) return null;

    // number
    if (typeof x === "number" && Number.isFinite(x)) {
      // if seconds, convert to ms
      if (x > 1e9 && x < 1e12) return Math.round(x * 1000);
      return Math.round(x);
    }

    // numeric string / date string
    if (typeof x === "string") {
      const s = x.trim();
      if (!s) return null;
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        if (!Number.isFinite(n)) return null;
        if (n > 1e9 && n < 1e12) return Math.round(n * 1000);
        return Math.round(n);
      }
      const parsed = Date.parse(s);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  };

  const toNum = (x: any): number | null => {
    if (x == null) return null;
    if (typeof x === "number" && Number.isFinite(x)) return x;
    if (typeof x === "string") {
      // normalize "93 360,41 Kč" -> "93360.41"
      const s = x
        .trim()
        .replace(/\s+/g, "")
        .replace(/Kč/gi, "")
        .replace(/,/g, ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  // 1) Preferuj `history` (t/v)
  const fromHistory = Array.isArray(j.history)
    ? (j.history as any[])
        .map((p) => ({
          t: toTs((p as any)?.t),
          v: toNum((p as any)?.v),
        }))
        .filter((p) => p.t != null && p.v != null && (p.v as number) > 0)
        .map((p) => ({ t: p.t as number, v: p.v as number }))
        .sort((a, b) => a.t - b.t)
    : undefined;

  // 2) Fallback: backend může vracet historii i jako `czkSeries` (date/value/close/...)
  const fromCzkSeries =
    !fromHistory?.length && Array.isArray((j as any).czkSeries)
      ? ((j as any).czkSeries as any[])
          .map((p) => {
            const t = toTs((p as any)?.t ?? (p as any)?.date ?? (p as any)?.d);
            const v = toNum((p as any)?.v ?? (p as any)?.value ?? (p as any)?.close ?? (p as any)?.c);
            return { t, v };
          })
          .filter((p) => p.t != null && p.v != null && (p.v as number) > 0)
          .map((p) => ({ t: p.t as number, v: p.v as number }))
          .sort((a, b) => a.t - b.t)
      : undefined;

  const history = (fromHistory?.length ? fromHistory : fromCzkSeries) ?? undefined;

  // Backend může vracet buď `changes` (y1/y2/...) nebo `changesPct` ("1y"/"2y"/...)
  const fromPct = (j as GoldApiResponse).changesPct;
  const toFinite = (value: unknown): number | undefined => {
    if (value == null || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  const changes =
    j.changes ??
    (fromPct
      ? {
          d1: toFinite(fromPct["1d"]),
          m3: toFinite(fromPct["3m"]),
          y1: toFinite(fromPct["1y"]),
          y2: toFinite(fromPct["2y"]),
          y3: toFinite(fromPct["3y"]),
          y5: toFinite(fromPct["5y"]),
          y10: toFinite(fromPct["10y"]),
        }
      : undefined);

  return {
    usdPerOz,
    usdCzk,
    czkPerOz,
    ts,
    stale: Boolean((j as GoldApiResponse).stale),
    asOfDate: typeof (j as GoldApiResponse).asOfDate === "string" ? (j as GoldApiResponse).asOfDate! : null,
    history,
    changes,
  };
}

async function fetchComfortPrices(): Promise<{
  source: "live" | "fallback";
  stale: boolean;
  message: string | null;
  prices: Partial<Record<ComfortPriceKey, ComfortLivePrice>>;
}> {
  const response = await fetch("/api/comfort-prices", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as ComfortPricesApiResponse | null;

  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error(
      String(payload?.error || payload?.message || "Nepodařilo se načíst ceník Comfort Commodity.")
    );
  }

  return {
    source: payload.source ?? "live",
    stale: Boolean(payload.stale),
    message: typeof payload.message === "string" ? payload.message : null,
    prices: payload.prices ?? {},
  };
}

function GoldChart({ points }: { points: Point[] }) {
  const w = 760;
  const h = 320;
  const pad = { l: 56, r: 14, t: 14, b: 34 };
  const MIN_VISIBLE_CANDLES = 20;

  const [hover, setHover] = useState<null | { idx: number; x: number; y: number }>(null);
  const [viewRange, setViewRange] = useState<{ start: number; end: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<null | { startX: number; start: number; end: number }>(null);

  const baseCandles = useMemo(() => {
    if (!points || points.length < 2) return null;

    const sorted = [...points].sort((a, b) => a.t - b.t);
    if (sorted.length < 2) return null;

    const rawCandles = sorted.slice(1).map((curr, idx) => {
      const prev = sorted[idx];
      const next = sorted[idx + 2] ?? curr;
      const open = prev.v;
      const close = curr.v;
      const high = Math.max(open, close, next.v);
      const low = Math.min(open, close, next.v);
      return { t: curr.t, open, close, high, low };
    });

    return rawCandles.length ? rawCandles : null;
  }, [points]);

  const normalizedViewRange = useMemo(() => {
    if (!baseCandles || !baseCandles.length) return null;
    const total = baseCandles.length;
    if (!viewRange) return { start: 0, end: total - 1 };
    const count = Math.max(1, Math.min(total, viewRange.end - viewRange.start + 1));
    const start = Math.min(Math.max(0, viewRange.start), Math.max(0, total - count));
    return { start, end: start + count - 1 };
  }, [baseCandles, viewRange]);

  const prepared = useMemo(() => {
    if (!baseCandles || !baseCandles.length) return null;

    const totalCandles = baseCandles.length;
    const clampedStart = Math.min(
      Math.max(0, normalizedViewRange?.start ?? 0),
      totalCandles - 1
    );
    const clampedEnd = Math.min(
      Math.max(clampedStart, normalizedViewRange?.end ?? totalCandles - 1),
      totalCandles - 1
    );
    const visible = baseCandles.slice(clampedStart, clampedEnd + 1);
    if (!visible.length) return null;

    const xs = visible.map((c) => c.t);
    const minT = Math.min(...xs);
    const maxT = Math.max(...xs);

    let minV = Math.min(...visible.map((c) => c.low));
    let maxV = Math.max(...visible.map((c) => c.high));

    const rawSpan = maxV - minV;
    if (rawSpan < Math.max(1e-9, Math.abs(maxV) * 0.0005)) {
      const p = Math.max(1, Math.abs(maxV) * 0.01);
      minV = maxV - p;
      maxV = maxV + p;
    } else {
      const p = rawSpan * 0.08;
      minV -= p;
      maxV += p;
    }

    const spanT = Math.max(1, maxT - minT);
    const spanV = Math.max(1e-9, maxV - minV);
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const xOfT = (t: number) => pad.l + ((t - minT) / spanT) * innerW;
    const yOfV = (v: number) => pad.t + (1 - (v - minV) / spanV) * innerH;

    const candles = visible.map((c) => ({
      ...c,
      x: xOfT(c.t),
      yOpen: yOfV(c.open),
      yClose: yOfV(c.close),
      yHigh: yOfV(c.high),
      yLow: yOfV(c.low),
      up: c.close >= c.open,
    }));

    const pts = candles.map((c) => ({
      t: c.t,
      v: c.close,
      x: c.x,
      y: c.yClose,
    }));

    const minGap =
      candles.length > 1
        ? candles.slice(1).reduce((best, c, i) => Math.min(best, c.x - candles[i].x), Number.POSITIVE_INFINITY)
        : innerW;
    const candleWidth = Math.max(3, Math.min(14, Number.isFinite(minGap) ? minGap * 0.6 : 10));

    const fmtDate = (ms: number) =>
      new Date(ms).toLocaleDateString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

    const spanDays = spanT / (1000 * 60 * 60 * 24);
    const fmtTickDate = (ms: number) =>
      new Date(ms).toLocaleDateString("cs-CZ", {
        day: spanDays <= 120 ? "2-digit" : undefined,
        month: spanDays <= 730 ? "2-digit" : "short",
        year: spanDays > 365 ? "numeric" : undefined,
      });

    const buildTicks = (min: number, max: number, count: number) => {
      if (count <= 1) return [min];
      return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
    };

    const yTicks = buildTicks(minV, maxV, 5).map((v) => ({ y: yOfV(v), v }));
    const xTickCount = spanDays > 3650 ? 8 : spanDays > 1825 ? 7 : spanDays > 730 ? 6 : spanDays > 120 ? 5 : 4;
    const xTicks = buildTicks(minT, maxT, xTickCount).map((t) => ({ x: xOfT(t), t }));

    const minPoint = pts.reduce((best, p) => (p.v < best.v ? p : best), pts[0]);
    const maxPoint = pts.reduce((best, p) => (p.v > best.v ? p : best), pts[0]);
    const startPoint = pts[0];
    const endPoint = pts[pts.length - 1];
    const totalChangePct = startPoint.v > 0 ? ((endPoint.v / startPoint.v) - 1) * 100 : null;

    return {
      pts,
      candles,
      candleWidth,
      yTicks,
      xTicks,
      fmtDate,
      fmtTickDate,
      minPoint,
      maxPoint,
      totalChangePct,
      windowStart: clampedStart,
      windowEnd: clampedEnd,
      totalCandles,
    };
  }, [baseCandles, normalizedViewRange, pad.b, pad.l, pad.r, pad.t, w, h]);

  const minVisibleCandles = prepared ? Math.min(MIN_VISIBLE_CANDLES, prepared.totalCandles) : MIN_VISIBLE_CANDLES;
  const visibleCount = prepared ? prepared.windowEnd - prepared.windowStart + 1 : 0;

  const getMousePoint = (e: React.MouseEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    let xRaw: number;
    let yRaw: number;

    if (ctm) {
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      xRaw = point.x;
      yRaw = point.y;
    } else {
      const rect = svg.getBoundingClientRect();
      xRaw = ((e.clientX - rect.left) / rect.width) * w;
      yRaw = ((e.clientY - rect.top) / rect.height) * h;
    }

    const x = Math.min(w - pad.r, Math.max(pad.l, xRaw));
    const y = Math.min(h - pad.b, Math.max(pad.t, yRaw));
    return { x, y };
  };

  const nearestIdxByX = (x: number) => {
    if (!prepared) return 0;
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < prepared.pts.length; i++) {
      const d = Math.abs(prepared.pts[i].x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const zoomTo = (factor: number, pivotAbsIndex?: number) => {
    if (!prepared) return;
    const total = prepared.totalCandles;
    const currentCount = prepared.windowEnd - prepared.windowStart + 1;
    const targetCount = Math.min(
      total,
      Math.max(minVisibleCandles, Math.round(currentCount * factor))
    );
    if (targetCount === currentCount) return;

    const pivot = Math.min(
      prepared.windowEnd,
      Math.max(
        prepared.windowStart,
        pivotAbsIndex ?? Math.round((prepared.windowStart + prepared.windowEnd) / 2)
      )
    );
    const ratio =
      currentCount > 1
        ? (pivot - prepared.windowStart) / (currentCount - 1)
        : 0.5;

    let newStart = Math.round(pivot - ratio * (targetCount - 1));
    newStart = Math.min(Math.max(0, newStart), Math.max(0, total - targetCount));
    const newEnd = newStart + targetCount - 1;
    setViewRange({ start: newStart, end: newEnd });
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!prepared) return;
    const { x, y } = getMousePoint(e);

    if (panRef.current) {
      const base = panRef.current;
      const width = Math.max(1, w - pad.l - pad.r);
      const count = base.end - base.start + 1;
      const shift = Math.round((-(x - base.startX) / width) * count);
      const maxStart = Math.max(0, prepared.totalCandles - count);
      const nextStart = Math.min(Math.max(0, base.start + shift), maxStart);
      setViewRange({ start: nextStart, end: nextStart + count - 1 });
    }

    const idx = nearestIdxByX(x);
    setHover({ idx, x, y });
  };

  const stopPan = () => {
    panRef.current = null;
    setIsPanning(false);
  };

  const onDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!prepared || e.button !== 0) return;
    if (visibleCount >= prepared.totalCandles) return;
    const { x } = getMousePoint(e);
    panRef.current = {
      startX: x,
      start: prepared.windowStart,
      end: prepared.windowEnd,
    };
    setIsPanning(true);
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!prepared) return;
    e.preventDefault();
    const { x } = getMousePoint(e);
    const nearest = nearestIdxByX(x);
    const absPivot = prepared.windowStart + nearest;
    zoomTo(e.deltaY > 0 ? 1.2 : 0.8, absPivot);
  };

  const onLeave = () => {
    stopPan();
    setHover(null);
  };

  if (!prepared) {
    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-950 px-4 py-6 text-sm text-slate-100">
        Nemám historická data pro graf (API nevrátilo dost bodů). Zkus přepnout rozsah.
      </div>
    );
  }

  const safeHover =
    hover && hover.idx >= 0 && hover.idx < prepared.pts.length ? hover : null;
  const hp = safeHover ? prepared.pts[safeHover.idx] : null;
  const hoveredCandle = safeHover ? prepared.candles[safeHover.idx] : null;
  const candleDelta = hoveredCandle ? hoveredCandle.close - hoveredCandle.open : null;
  const candleDeltaPct =
    hoveredCandle && hoveredCandle.open > 0
      ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100
      : null;
  const candleBadgeClass =
    candleDelta == null
      ? "border border-slate-300 bg-slate-100 text-slate-700"
      : candleDelta > 0
        ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
        : candleDelta < 0
          ? "border border-rose-300 bg-rose-50 text-rose-700"
          : "border border-slate-300 bg-slate-100 text-slate-700";
  const candleTrendSign = candleDelta != null && candleDelta > 0 ? "+" : "";
  const canZoomOut = visibleCount < prepared.totalCandles;
  const canZoomIn = visibleCount > minVisibleCandles;
  const totalChangeText =
    prepared.totalChangePct == null
      ? "—"
      : `${prepared.totalChangePct >= 0 ? "+" : ""}${formatNum(prepared.totalChangePct, 2)} %`;
  const totalChangeClass =
    prepared.totalChangePct == null
      ? "border-slate-200 bg-slate-50 text-slate-700"
      : prepared.totalChangePct >= 0
        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
        : "border-rose-300 bg-rose-50 text-rose-700";
  const zoomButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-950 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_58%,#eef2f7_100%)] p-3 shadow-[0_20px_48px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.70)]">
      <div className="absolute left-0 top-0 h-1 w-full bg-[linear-gradient(90deg,#c89d2e_0%,#f6d36b_45%,#64748b_100%)]" />

      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bodů</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-950">{prepared.pts.length}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Minimum</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-950">{formatCzk(prepared.minPoint.v)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Maximum</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-950">{formatCzk(prepared.maxPoint.v)}</div>
          </div>
          <div className={["rounded-xl border px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)]", totalChangeClass].join(" ")}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">Změna</div>
            <div className="mt-0.5 text-sm font-semibold">{totalChangeText}</div>
          </div>
        </div>

        <div className="flex w-fit items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
          <button
            type="button"
            onClick={() => zoomTo(0.8)}
            disabled={!canZoomIn}
            className={zoomButtonClass}
            aria-label="Přiblížit graf"
            title="Přiblížit"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zoomTo(1.2)}
            disabled={!canZoomOut}
            className={zoomButtonClass}
            aria-label="Oddálit graf"
            title="Oddálit"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setViewRange({ start: 0, end: prepared.totalCandles - 1 });
              setHover(null);
            }}
            disabled={!canZoomOut}
            className={zoomButtonClass}
            aria-label="Resetovat zoom grafu"
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.90)]">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className={`h-[330px] w-full select-none ${isPanning ? "cursor-grabbing" : "cursor-crosshair"}`}
          role="img"
          aria-label="Graf ceny zlata"
          onMouseMove={onMove}
          onMouseDown={onDown}
          onMouseUp={stopPan}
          onMouseLeave={onLeave}
          onWheel={onWheel}
        >
          <rect x={pad.l} y={pad.t} width={w - pad.l - pad.r} height={h - pad.t - pad.b} fill="#f8fafc" rx="8" />

          <g stroke="rgba(100,116,139,0.24)" strokeWidth="1">
            {prepared.yTicks.map((t, i) => (
              <line key={`gy-${i}`} x1={pad.l} y1={t.y} x2={w - pad.r} y2={t.y} strokeDasharray="3 3" />
            ))}
          </g>

          <g className="fill-slate-500" fontSize="11">
            {prepared.yTicks.map((t, i) => (
              <text key={`yl-${i}`} x={8} y={t.y + 4} opacity={0.9}>
                {formatCzk(t.v)}
              </text>
            ))}
          </g>

          <g className="fill-slate-500" fontSize="11">
            {prepared.xTicks.map((t, i) => (
              <text
                key={`xl-${i}`}
                x={t.x}
                y={h - 10}
                textAnchor={i === 0 ? "start" : i === prepared.xTicks.length - 1 ? "end" : "middle"}
                opacity={0.9}
              >
                {prepared.fmtTickDate(t.t)}
              </text>
            ))}
          </g>

          <g stroke="rgba(100,116,139,0.24)" strokeDasharray="4 4" strokeWidth="1">
            <line x1={pad.l} y1={prepared.minPoint.y} x2={w - pad.r} y2={prepared.minPoint.y} />
            <line x1={pad.l} y1={prepared.maxPoint.y} x2={w - pad.r} y2={prepared.maxPoint.y} />
          </g>

          <g>
            {prepared.candles.map((c, i) => {
              const bodyTop = Math.min(c.yOpen, c.yClose);
              const bodyHeight = Math.max(1.5, Math.abs(c.yClose - c.yOpen));
              const color = c.up ? "#34d399" : "#f87171";
              const stroke = c.up ? "#10b981" : "#ef4444";
              return (
                <g key={`c-${i}-${c.t}`}>
                  <line x1={c.x} y1={c.yHigh} x2={c.x} y2={c.yLow} stroke={stroke} strokeWidth={1.2} />
                  <rect
                    x={c.x - prepared.candleWidth / 2}
                    y={bodyTop}
                    width={prepared.candleWidth}
                    height={bodyHeight}
                    fill={color}
                    stroke={stroke}
                    strokeWidth={1}
                    rx={1}
                  />
                </g>
              );
            })}
          </g>

          {safeHover ? (
            <g>
              <line x1={safeHover.x} y1={pad.t} x2={safeHover.x} y2={h - pad.b} stroke="rgba(15,23,42,0.26)" strokeWidth="1" />
              <line x1={pad.l} y1={safeHover.y} x2={w - pad.r} y2={safeHover.y} stroke="rgba(15,23,42,0.18)" strokeWidth="1" />
              {hp ? (
                <circle cx={hp.x} cy={hp.y} r={4} fill="#0f172a" stroke="rgba(255,255,255,0.9)" />
              ) : null}
              {hoveredCandle ? (
                <rect
                  x={hoveredCandle.x - prepared.candleWidth / 2 - 1}
                  y={Math.min(hoveredCandle.yOpen, hoveredCandle.yClose) - 1}
                  width={prepared.candleWidth + 2}
                  height={Math.max(2, Math.abs(hoveredCandle.yClose - hoveredCandle.yOpen) + 2)}
                  fill="none"
                  stroke="rgba(15,23,42,0.72)"
                  strokeWidth="1"
                  rx={1}
                />
              ) : null}
            </g>
          ) : null}
        </svg>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        {hoveredCandle && hp ? (
          <>
            <div className="flex flex-wrap items-center gap-2 tabular-nums">
              <span className="inline-flex rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 font-semibold text-white">
                {prepared.fmtDate(hp.t)}
              </span>
              <span className={["inline-flex rounded-full px-2.5 py-1 font-semibold", candleBadgeClass].join(" ")}>
                Změna svíčky:{" "}
                {candleDelta == null
                  ? "—"
                  : `${candleTrendSign}${formatCzk(candleDelta)} (${candleTrendSign}${formatNum(candleDeltaPct ?? 0, 2)} %)`}
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 tabular-nums">
            <span className="inline-flex rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 font-semibold text-white">
              Detail svíčky
            </span>
            <span className="text-slate-500">Bez vybrané svíčky</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ChangeChip({ label, value }: { label: string; value: number | null | undefined }) {
  const dir = value == null ? "flat" : value > 0 ? "up" : value < 0 ? "down" : "flat";

  const badgeCls =
    dir === "up"
      ? "bg-emerald-600 text-white"
      : dir === "down"
        ? "bg-rose-600 text-white"
        : "bg-slate-700 text-white";
  const sign = dir === "up" ? "▲" : dir === "down" ? "▼" : "•";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</span>
      <span className={["inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold leading-none", badgeCls].join(" ")}>
        <span>{sign}</span>
        <span>{value == null ? "—" : `${formatNum(Math.abs(value), 1)} %`}</span>
      </span>
    </div>
  );
}

export default function GoldToolPage() {
  const [view, setView] = useState<GoldView>("movement");
  const [comfortBrand, setComfortBrand] = useState<ComfortBrand>("argor");
  const [activeComfortIndex, setActiveComfortIndex] = useState(() => getDefaultComfortIndex("argor"));
  const [unit, setUnit] = useState<UnitKey>("oz");
  const [range, setRange] = useState<RangeKey>("y1");
  const [loadingRange, setLoadingRange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [czkPerOz, setCzkPerOz] = useState<number | null>(null);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [secondsToRefresh, setSecondsToRefresh] = useState(60);
  const [refreshingNow, setRefreshingNow] = useState(false);
  const [isWeekendPause, setIsWeekendPause] = useState(() => isWeekendDay());

  // historie – CZK / oz
  const [history, setHistory] = useState<Point[]>([]);
  // fallback série (kdyby historie nepřišla) – CZK / oz
  const [series, setSeries] = useState<Point[]>([]);

  const [changes, setChanges] = useState<GoldApiResponse["changes"] | null>(null);
  const [comfortLivePrices, setComfortLivePrices] = useState<
    Partial<Record<ComfortPriceKey, ComfortLivePrice>>
  >({});
  const [comfortSyncState, setComfortSyncState] = useState<"idle" | "live" | "fallback" | "error">("idle");
  const [comfortSyncMessage, setComfortSyncMessage] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const secondRef = useRef<number | null>(null);

  const selected = UNITS[unit];

  const czkForSelectedUnit = useMemo(() => {
    if (czkPerOz == null) return null;
    return (czkPerOz / OUNCE_G) * selected.grams;
  }, [czkPerOz, selected.grams]);

  const comfortReference = COMFORT_BRAND_REFERENCES[comfortBrand];

  const comfortRows = useMemo(() => {
    if (czkPerOz == null || !Number.isFinite(czkPerOz) || czkPerOz <= 0) {
      return comfortReference.products.map((product) => {
        const livePrice = product.priceKey ? comfortLivePrices[product.priceKey] : null;
        const officialSell = livePrice?.sellCzk ?? product.sellCzk;
        const officialBuyback = livePrice?.buybackCzk ?? product.buybackCzk;

        return {
          ...product,
          spotValue: null,
          sell: product.priceMode === "official" ? officialSell : null,
          buyback: product.priceMode === "official" ? officialBuyback : null,
          spread:
            product.priceMode === "official"
              ? officialSell - officialBuyback
              : null,
          sellPremiumPct: null,
          buybackPremiumPct: null,
        };
      });
    }

    if (comfortReference.spotCzkPerOz == null || !Number.isFinite(comfortReference.spotCzkPerOz) || comfortReference.spotCzkPerOz <= 0) {
      return comfortReference.products.map((product) => {
        const livePrice = product.priceKey ? comfortLivePrices[product.priceKey] : null;
        const officialSell = livePrice?.sellCzk ?? product.sellCzk;
        const officialBuyback = livePrice?.buybackCzk ?? product.buybackCzk;

        return {
          ...product,
          spotValue: (czkPerOz / OUNCE_G) * product.grams,
          sell: product.priceMode === "official" ? officialSell : null,
          buyback: product.priceMode === "official" ? officialBuyback : null,
          spread: product.priceMode === "official" ? officialSell - officialBuyback : null,
          sellPremiumPct: null,
          buybackPremiumPct: null,
        };
      });
    }

    return comfortReference.products.map((product) => {
      const livePrice = product.priceKey ? comfortLivePrices[product.priceKey] : null;
      const officialSell = livePrice?.sellCzk ?? product.sellCzk;
      const officialBuyback = livePrice?.buybackCzk ?? product.buybackCzk;
      const referenceSpot = product.spotCzkPerOz ?? comfortReference.spotCzkPerOz;
      const spotValue = (czkPerOz / OUNCE_G) * product.grams;
      const isOfficial = product.priceMode === "official";
      const scale = isOfficial ? 1 : czkPerOz / referenceSpot;
      const sell = isOfficial ? officialSell : Math.round(product.sellCzk * scale);
      const buyback = isOfficial ? officialBuyback : Math.round(product.buybackCzk * scale);
      const sellPremiumPct = sell != null && spotValue > 0 ? (sell / spotValue - 1) * 100 : null;
      const buybackPremiumPct = buyback != null && spotValue > 0 ? (buyback / spotValue - 1) * 100 : null;

      return {
        ...product,
        spotValue,
        sell,
        buyback,
        spread: sell == null || buyback == null ? null : sell - buyback,
        sellPremiumPct,
        buybackPremiumPct,
      };
    });
  }, [comfortLivePrices, comfortReference, czkPerOz]);

  useEffect(() => {
    setActiveComfortIndex(getDefaultComfortIndex(comfortBrand));
  }, [comfortBrand]);

  useEffect(() => {
    if (view === "comfort") {
      setActiveComfortIndex(getDefaultComfortIndex(comfortBrand));
    }
  }, [comfortBrand, view]);

  useEffect(() => {
    setActiveComfortIndex((prev) => {
      if (!comfortRows.length) return 0;
      return Math.min(prev, comfortRows.length - 1);
    });
  }, [comfortRows.length]);

  const moveComfortCarousel = (direction: -1 | 1) => {
    setActiveComfortIndex((prev) => {
      const total = comfortRows.length;
      if (total <= 1) return 0;
      return (prev + direction + total) % total;
    });
  };

  const activeComfortRow = comfortRows[activeComfortIndex] ?? null;
  const activeComfortApiOverride = Boolean(
    activeComfortRow?.priceMode === "official" &&
      activeComfortRow?.priceKey &&
      comfortLivePrices[activeComfortRow.priceKey]
  );
  const comfortSourceText =
    activeComfortRow?.priceMode === "official" && activeComfortApiOverride && comfortSyncState === "live"
      ? `${activeComfortRow.label}: živé ceny z Comfort Commodity API`
      : activeComfortRow?.priceMode === "official" && activeComfortApiOverride && comfortSyncState === "fallback"
        ? `${activeComfortRow.label}: ceny z cache Comfort Commodity API`
      : activeComfortRow?.priceMode === "official" && activeComfortRow.asOf
        ? `${activeComfortRow.label}: ceník Comfort Commodity ${activeComfortRow.asOf}`
      : comfortReference.asOf && comfortReference.spotCzkPerOz
        ? `Kalibrace ${comfortReference.asOf} při spotu ${formatCzk(comfortReference.spotCzkPerOz)}`
        : "Kalibrace bude doplněna";
  const comfortModelText =
    activeComfortRow?.priceMode === "official" && activeComfortApiOverride
      ? "Ceny 1 oz se synchronizují přímo z Comfort Commodity; ostatní gramáže se dál přepočítávají modelově."
      : activeComfortRow?.priceMode === "official"
        ? "Tato položka drží ručně zadaný ceník Comfort Commodity; ostatní gramáže se dál přepočítávají modelově."
      : "Model: kalibrační cena × aktuální spot / kalibrační spot. Comfort může ceny fixovat dávkově.";

  // animovaný „counter“ pro hlavní cenu
  const [displayPrice, setDisplayPrice] = useState<number | null>(null);
  const animRef = useRef<number | null>(null);
  const displayedRef = useRef<number | null>(null);

  useEffect(() => {
    const target = czkForSelectedUnit;

    if (loading || target == null || !Number.isFinite(target)) {
      setDisplayPrice(null);
      displayedRef.current = null;
      if (animRef.current) {
        window.cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      return;
    }

    const from = displayedRef.current;

    // první render / po chybě: nastav rovnou bez animace
    if (from == null || !Number.isFinite(from)) {
      setDisplayPrice(target);
      displayedRef.current = target;
      return;
    }

    const diff = target - from;

    // drobná změna: bez animace
    if (Math.abs(diff) < 0.5) {
      setDisplayPrice(target);
      displayedRef.current = target;
      return;
    }

    if (animRef.current) {
      window.cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    const start = performance.now();
    const duration = 650; // ms
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + diff * easeOutCubic(t);
      setDisplayPrice(v);
      displayedRef.current = v;

      if (t < 1) {
        animRef.current = window.requestAnimationFrame(step);
      } else {
        animRef.current = null;
        displayedRef.current = target;
        setDisplayPrice(target);
      }
    };

    animRef.current = window.requestAnimationFrame(step);

    return () => {
      if (animRef.current) {
        window.cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [czkForSelectedUnit, loading, unit]);

  // graf kopíruje vybranou jednotku
  const chartPoints: Point[] = useMemo(() => {
    const base = history.length >= 2 ? history : series;
    if (!base.length) return [];

    const factor = selected.grams / OUNCE_G;
    const scaled = base.map((p) => ({ t: p.t, v: p.v * factor }));
    return downsamplePoints(scaled, 1400);
  }, [history, series, selected.grams]);

  const loadComfortTick = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const snap = await fetchComfortPrices();
      if (isCancelled?.()) return;
      setComfortLivePrices(snap.prices);
      setComfortSyncState(snap.source === "fallback" ? "fallback" : "live");
      setComfortSyncMessage(snap.message);
    } catch (e: any) {
      if (isCancelled?.()) return;
      setComfortSyncState("error");
      setComfortSyncMessage(
        String(e?.message || "Nepodařilo se načíst ceník Comfort Commodity.")
      );
    }
  }, []);

  const loadTick = useCallback(async () => {
    const snap = await fetchGold({ days: 0 });

    setCzkPerOz(snap.czkPerOz);
    setLastUpdated(new Date(snap.ts));
    setIsStale(Boolean(snap.stale));
    setSecondsToRefresh(60);

    // nezahlcujeme – držíme max 120 bodů
    setSeries((prev) => {
      const next = [...prev, { t: snap.ts, v: snap.czkPerOz }];
      return next.slice(Math.max(0, next.length - 120));
    });

    await loadComfortTick();
  }, [loadComfortTick]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setLoadingRange(true);
        const snap = await fetchGold({ days: RANGES[range].days, range });
        if (cancelled) return;

        setCzkPerOz(snap.czkPerOz);
        setLastUpdated(new Date(snap.ts));
        setIsStale(Boolean(snap.stale));
        setSecondsToRefresh(60);

        if (snap.history?.length) setHistory(snap.history);
        else setHistory([]);

        setChanges(snap.changes ?? null);

        // fallback (jen aby UI neumřelo, když historie není)
        setSeries([{ t: snap.ts, v: snap.czkPerOz }]);
        await loadComfortTick(() => cancelled);
        if (cancelled) return;
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message || "Nepodařilo se načíst data o zlatě."));
      } finally {
        if (cancelled) return;
        setLoading(false);
        setLoadingRange(false);
      }
    })();

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(async () => {
      const weekendNow = isWeekendDay();
      setIsWeekendPause((prev) => (prev === weekendNow ? prev : weekendNow));
      if (weekendNow) return;

      try {
        await loadTick();
      } catch {
        // ticho – při dalším ticku to zkusíme znovu
      }
    }, 60_000);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [range, loadComfortTick, loadTick]);

  useEffect(() => {
    if (secondRef.current) window.clearInterval(secondRef.current);
    setIsWeekendPause(isWeekendDay());
    secondRef.current = window.setInterval(() => {
      const weekendNow = isWeekendDay();
      setIsWeekendPause((prev) => (prev === weekendNow ? prev : weekendNow));
      if (weekendNow) return;

      setSecondsToRefresh((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => {
      if (secondRef.current) window.clearInterval(secondRef.current);
    };
  }, []);

  const manualRefresh = async () => {
    try {
      setRefreshingNow(true);
      setErr(null);
      await loadTick();
    } catch (e: any) {
      setErr(String(e?.message || "Nepodařilo se obnovit data."));
    } finally {
      setRefreshingNow(false);
    }
  };

  const changeRows: { label: string; value: number | null | undefined }[] = [
    { label: "1 den", value: changes?.d1 },
    { label: "3 měsíce", value: changes?.m3 },
    { label: "1 rok", value: changes?.y1 },
    { label: "2 roky", value: changes?.y2 },
    { label: "3 roky", value: changes?.y3 },
    { label: "5 let", value: changes?.y5 },
    { label: "10 let", value: changes?.y10 },
  ];
  const positiveChanges = changeRows.filter((row) => row.value != null && row.value > 0).length;
  const negativeChanges = changeRows.filter((row) => row.value != null && row.value < 0).length;
  const dataBadge = isWeekendPause
    ? {
        label: "Market closed (víkend)",
        className: "border-rose-700 bg-rose-600 text-white",
      }
    : isStale
      ? {
          label: "Stale snapshot",
          className: "border-slate-300 bg-white text-slate-600",
        }
      : {
          label: "Live data",
          className: "border-emerald-700 bg-emerald-600 text-white",
        };
  const comfortSyncBadge =
    comfortSyncState === "live"
      ? {
          label: "Comfort sync: LIVE",
          className: "border-emerald-300 bg-emerald-50 text-emerald-800",
        }
      : comfortSyncState === "fallback"
        ? {
            label: "Comfort sync: CACHE",
            className: "border-amber-300 bg-amber-50 text-amber-800",
          }
        : comfortSyncState === "error"
          ? {
              label: "Comfort sync: ERROR",
              className: "border-rose-300 bg-rose-50 text-rose-800",
            }
          : {
              label: "Comfort sync: INIT",
              className: "border-slate-300 bg-slate-50 text-slate-700",
            };

  return (
    <AppLayout active="tools">
      <div className="w-full bg-white px-3 py-4 sm:px-4 sm:py-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl space-y-4 font-mono text-slate-900">
          <section className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-300 bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.1)]">
                {[
                  { key: "movement", label: "POHYB CENY" },
                  { key: "comfort", label: "COMFORT COMMODITY" },
                ].map((item) => {
                  const active = view === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setView(item.key as GoldView)}
                      className={[
                        "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition sm:text-sm",
                        active
                          ? "bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      ].join(" ")}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {view === "movement" ? (
                <div className="lg:justify-end">
                  <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-300 bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.1)]">
                    {(Object.keys(UNITS) as UnitKey[]).map((k) => {
                      const active = unit === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setUnit(k)}
                          className={[
                            "whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition",
                            active
                              ? "bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                          ].join(" ")}
                        >
                          {UNITS[k].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {err ? (
              <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {err}
              </div>
            ) : null}

            {view === "movement" ? (
              <div className="relative overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-4 shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                  <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
                    <div className="h-1 bg-[linear-gradient(90deg,#c89d2e_0%,#f6d36b_45%,#94a3b8_100%)]" />
                    <div className="relative flex min-h-[236px] items-center justify-center overflow-hidden px-5 py-6">
                      <div className="absolute inset-y-0 right-0 w-48 bg-[linear-gradient(130deg,rgba(248,250,252,0)_0%,rgba(203,213,225,0.42)_100%)]" />
                      <div className="relative flex w-full max-w-[720px] flex-col items-center text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Cena ({selected.label})</div>
                        <div className="mt-3 text-5xl font-semibold leading-none tracking-tight text-slate-950 sm:text-6xl lg:text-[4.15rem]">
                          {loading ? "Načítám…" : formatCzk(displayPrice ?? czkForSelectedUnit)}
                        </div>
                        <div className="mt-4 text-xs text-slate-500">
                          {lastUpdated ? `Aktualizováno: ${lastUpdated.toLocaleString("cs-CZ")}` : ""}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              dataBadge.className,
                            ].join(" ")}
                          >
                            {dataBadge.label}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                            {isWeekendPause ? "Auto-refresh pozastaven (víkend)" : `Další auto-refresh za ${secondsToRefresh}s`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
                    <div className="h-1 bg-[linear-gradient(90deg,#c89d2e_0%,#f6d36b_45%,#94a3b8_100%)]" />
                    <div className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Nárůst / pokles</div>
                          <div className="mt-1 text-sm font-semibold text-slate-950">CZK / unce</div>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[10px]">
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                            ▲ {positiveChanges}
                          </span>
                          <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                            ▼ {negativeChanges}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {changeRows.map((row) => (
                          <ChangeChip key={row.label} label={row.label} value={row.value} />
                        ))}
                      </div>
                    </div>
                  </section>
                </div>

                <section className="mt-4 rounded-2xl border border-slate-300 bg-white px-4 py-4 shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Graf ({RANGES[range].label})
                        {loadingRange ? <span className="ml-2 text-slate-500">• načítám…</span> : null}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-950">Historie zvolené gramáže</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(RANGES) as RangeKey[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setRange(k)}
                          className={[
                            "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                            range === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {RANGES[k].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <GoldChart points={chartPoints} />
                  </div>
                </section>

                <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-600">
                  <span className="text-slate-600">Data jsou orientační.</span>

                  <span className="relative group">
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-900 bg-slate-900 text-[12px] font-bold text-white"
                      aria-label="Info"
                      title=""
                    >
                      i
                    </span>

                    <span className="pointer-events-none absolute right-0 top-0 z-10 hidden w-[320px] -translate-y-[calc(100%+10px)] rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.15)] group-hover:block">
                      Zdroj: /api/gold (server-side). Spot XAU (USD/oz) + USD/CZK + historie (CZK/oz). Výstup je pouze
                      informativní.
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-4 shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
                <div className="flex flex-col gap-4 border-b border-slate-300 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex shrink-0">
                    <Image
                      src="/icons/cclogo1.png"
                      alt="Comfort Commodity"
                      width={1110}
                      height={271}
                      className="h-12 w-auto object-contain sm:h-14"
                      priority
                    />
                  </div>

                  <div className="flex w-fit items-center gap-1 self-start rounded-full border border-slate-900 bg-slate-950 p-1 sm:self-auto">
                    {(["argor", "pamp"] as ComfortBrand[]).map((brand) => {
                      const active = comfortBrand === brand;
                      return (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => setComfortBrand(brand)}
                          className={[
                            "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                            active ? "bg-white text-slate-900" : "text-white hover:bg-white/10",
                          ].join(" ")}
                        >
                          {COMFORT_BRAND_REFERENCES[brand].label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white/35 px-2 py-6 sm:px-6">
                  <button
                    type="button"
                    onClick={() => moveComfortCarousel(-1)}
                    disabled={comfortRows.length <= 1}
                    className="absolute left-3 top-1/2 z-40 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.16)] transition hover:-translate-x-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Předchozí gramáž"
                    title="Předchozí gramáž"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>

                  <div className="relative mx-auto h-[570px] max-w-6xl" style={{ perspective: "1200px" }}>
                    {comfortRows.map((row, index) => {
                      const total = comfortRows.length;
                      let offset = index - activeComfortIndex;
                      if (offset > total / 2) offset -= total;
                      if (offset < -total / 2) offset += total;
                      const distance = Math.abs(offset);
                      if (distance > 1) return null;

                      const isActive = offset === 0;
                      const translate = offset * 245;

                      return (
                        <article
                          key={row.label}
                          onClick={() => {
                            if (!isActive) setActiveComfortIndex(index);
                          }}
                          className={[
                            "group absolute left-1/2 top-0 w-[min(78vw,320px)] overflow-hidden rounded-2xl border bg-white transition-all duration-500 ease-out",
                            isActive
                              ? "border-slate-300 shadow-[0_28px_70px_rgba(15,23,42,0.18)]"
                              : "cursor-pointer border-slate-200 shadow-[0_18px_44px_rgba(15,23,42,0.10)]",
                          ].join(" ")}
                          style={{
                            transform: `translateX(calc(-50% + ${translate}px)) scale(${isActive ? 1 : 0.82}) rotateY(${offset * -8}deg)`,
                            opacity: isActive ? 1 : 0.58,
                            zIndex: isActive ? 30 : 12,
                            filter: isActive ? "none" : "saturate(0.88)",
                          }}
                          aria-hidden={!isActive}
                        >
                          <div className="h-1 bg-[linear-gradient(90deg,#c89d2e_0%,#f6d36b_45%,#94a3b8_100%)]" />
                          <div className="relative overflow-hidden border-b border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_48%,#e8edf4_100%)] px-5 pb-5 pt-5">
                            <div className="relative z-10 flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                  {comfortReference.cardLabel}
                                </div>
                                <div className="text-2xl font-semibold tracking-tight text-slate-950">{row.displayWeight}</div>
                              </div>
                              <div className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                                {comfortReference.purity}
                              </div>
                            </div>

                        <div className="relative mt-4 flex h-[220px] items-center justify-center">
                              <div className="absolute bottom-4 h-5 w-44 rounded-[999px] bg-slate-900/10 blur-md transition duration-300 group-hover:w-52 group-hover:bg-slate-900/14" />
                              {row.imageSrc ? (
                                <Image
                                  src={row.imageSrc}
                                  alt={row.label}
                                  width={1200}
                                  height={1200}
                                  className="relative z-10 h-[206px] w-full object-contain drop-shadow-[0_18px_26px_rgba(15,23,42,0.24)] transition-transform duration-300 group-hover:scale-[1.04]"
                                  sizes="(min-width: 768px) 32vw, 86vw"
                                />
                              ) : (
                                <div className="relative z-10 flex h-[190px] w-[150px] items-center justify-center rounded-xl border border-slate-300 bg-slate-950 text-2xl font-semibold tracking-[0.2em] text-white shadow-[0_18px_26px_rgba(15,23,42,0.24)] transition-transform duration-300 group-hover:scale-[1.04]">
                                  {comfortReference.label}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="px-5 py-4">
                            <div className="divide-y divide-slate-200">
                              <div className="flex items-end justify-between gap-3 py-3">
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Prodej</div>
                                  <div className="mt-1 h-1 w-10 rounded-full bg-emerald-400" />
                                </div>
                                <div className="text-right text-3xl font-semibold tracking-tight text-slate-950">
                                  {formatCzk(row.sell)}
                                </div>
                              </div>

                              <div className="flex items-end justify-between gap-3 py-3">
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Výkup</div>
                                  <div className="mt-1 h-1 w-10 rounded-full bg-slate-300" />
                                </div>
                                <div className="text-right text-3xl font-semibold tracking-tight text-slate-950">
                                  {formatCzk(row.buyback)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => moveComfortCarousel(1)}
                    disabled={comfortRows.length <= 1}
                    className="absolute right-3 top-1/2 z-40 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.16)] transition hover:translate-x-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Další gramáž"
                    title="Další gramáž"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>

                  <div className="mt-3 flex justify-center gap-1.5">
                    {comfortRows.map((row, index) => (
                      <button
                        key={`comfort-nav-${row.label}`}
                        type="button"
                        onClick={() => setActiveComfortIndex(index)}
                        className={[
                          "h-2.5 rounded-full transition-all",
                          activeComfortIndex === index ? "w-8 bg-slate-950" : "w-2.5 bg-slate-300 hover:bg-slate-400",
                        ].join(" ")}
                        aria-label={`Zobrazit ${row.displayWeight}`}
                        title={row.displayWeight}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <div>
                      {comfortSourceText}
                      {lastUpdated ? ` • aktualizováno ${lastUpdated.toLocaleString("cs-CZ")}` : ""}
                    </div>
                    <div>{comfortModelText}</div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                          comfortSyncBadge.className,
                        ].join(" ")}
                      >
                        {comfortSyncBadge.label}
                      </span>
                      {comfortSyncMessage ? (
                        <span className="text-[10px] text-slate-500">{comfortSyncMessage}</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={manualRefresh}
                    disabled={loading || loadingRange || refreshingNow}
                    className="w-fit rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {refreshingNow ? "Obnovuji…" : "Obnovit ceny"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
