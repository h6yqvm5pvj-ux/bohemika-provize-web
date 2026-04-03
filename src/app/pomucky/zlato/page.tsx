// src/app/pomucky/zlato/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";

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

function GoldChart({ points }: { points: Point[] }) {
  const w = 760;
  const h = 220;
  const pad = { l: 56, r: 14, t: 14, b: 34 };

  const [hover, setHover] = useState<null | { idx: number; x: number; y: number }>(null);

  const prepared = useMemo(() => {
    if (!points || points.length < 2) return null;

    const xs = points.map((p) => p.t);
    const ys = points.map((p) => p.v);

    const minT = Math.min(...xs);
    const maxT = Math.max(...xs);

    let minV = Math.min(...ys);
    let maxV = Math.max(...ys);

    // padding pro prakticky konstantní sérii
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

    const pts = points
      .map((p) => ({
        t: p.t,
        v: p.v,
        x: xOfT(p.t),
        y: yOfV(p.v),
      }))
      .sort((a, b) => a.t - b.t);

    const lineD = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const baseY = pad.t + innerH;
    const areaD = `${lineD} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY.toFixed(2)} L ${pts[0].x.toFixed(
      2
    )} ${baseY.toFixed(2)} Z`;

    // osy / popisky
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
    const showPointMarkers = pts.length <= 180;

    return {
      pts,
      lineD,
      areaD,
      baseY,
      yTicks,
      xTicks,
      fmtDate,
      fmtTickDate,
      minV,
      maxV,
      minT,
      maxT,
      xOfT,
      yOfV,
      spanDays,
      minPoint,
      maxPoint,
      startPoint,
      endPoint,
      totalChangePct,
      showPointMarkers,
    };
  }, [points, pad.b, pad.l, pad.r, pad.t, w, h]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!prepared) return;
    const rect = (e.currentTarget as any).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * w;

    // najdi nejbližší bod podle X
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < prepared.pts.length; i++) {
      const d = Math.abs(prepared.pts[i].x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }

    const p = prepared.pts[best];
    setHover({ idx: best, x: p.x, y: p.y });
  };

  const onLeave = () => setHover(null);

  if (!prepared) {
    return (
      <div className="rounded-2xl border border-slate-300 bg-white px-4 py-6 text-sm text-slate-700">
        Nemám historická data pro graf (API nevrátilo dost bodů). Zkus přepnout rozsah.
      </div>
    );
  }

  const hp = hover ? prepared.pts[hover.idx] : null;
  const prevHp = hp && hover && hover.idx > 0 ? prepared.pts[hover.idx - 1] : null;
  const pointDeltaPct = hp && prevHp && prevHp.v > 0 ? ((hp.v / prevHp.v) - 1) * 100 : null;

  return (
    <div className="relative rounded-2xl border border-slate-300 bg-white px-4 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span>Bodů: {prepared.pts.length}</span>
        <span>Min: {formatCzk(prepared.minPoint.v)}</span>
        <span>Max: {formatCzk(prepared.maxPoint.v)}</span>
        <span>
          Změna:{" "}
          {prepared.totalChangePct == null
            ? "—"
            : `${prepared.totalChangePct >= 0 ? "+" : ""}${formatNum(prepared.totalChangePct, 2)} %`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-[220px] select-none"
        role="img"
        aria-label="Graf ceny zlata"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <defs>
          <linearGradient id="goldArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0.06" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* grid */}
        <g className="text-slate-600" stroke="currentColor" strokeWidth="1">
          {prepared.yTicks.map((t, i) => (
            <line key={`gy-${i}`} x1={pad.l} y1={t.y} x2={w - pad.r} y2={t.y} />
          ))}
          {prepared.xTicks.map((t, i) => (
            <line key={`gx-${i}`} x1={t.x} y1={pad.t} x2={t.x} y2={h - pad.b} />
          ))}
        </g>

        {/* y labels */}
        <g className="fill-slate-500" fontSize="11">
          {prepared.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={8} y={t.y + 4} opacity={0.9}>
              {formatCzk(t.v)}
            </text>
          ))}
        </g>

        {/* x labels */}
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

        {/* min/max vodítka */}
        <g stroke="rgba(148,163,184,0.28)" strokeDasharray="4 4" strokeWidth="1">
          <line x1={pad.l} y1={prepared.minPoint.y} x2={w - pad.r} y2={prepared.minPoint.y} />
          <line x1={pad.l} y1={prepared.maxPoint.y} x2={w - pad.r} y2={prepared.maxPoint.y} />
        </g>

        {/* area + line */}
        <g className="text-rose-600">
          <path d={prepared.areaD} fill="url(#goldArea)" />
          <path
            d={prepared.lineD}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
            filter="url(#softGlow)"
          />
        </g>

        {/* markery datových bodů */}
        {prepared.showPointMarkers ? (
          <g>
            {prepared.pts.map((p, i) => (
              <circle
                key={`pt-${i}-${p.t}`}
                cx={p.x}
                cy={p.y}
                r={1.4}
                fill="rgba(15,23,42,0.45)"
                stroke="rgba(15,23,42,0.4)"
                strokeWidth="0.8"
              />
            ))}
          </g>
        ) : null}

        {/* hover */}
        {hp ? (
          <g>
            <line x1={hp.x} y1={pad.t} x2={hp.x} y2={h - pad.b} stroke="rgba(15,23,42,0.2)" strokeWidth="1" />
            <line x1={pad.l} y1={hp.y} x2={w - pad.r} y2={hp.y} stroke="rgba(15,23,42,0.18)" strokeWidth="1" />
            <circle cx={hp.x} cy={hp.y} r={4} fill="rgba(15,23,42,0.95)" stroke="rgba(15,23,42,0.6)" />
          </g>
        ) : null}
      </svg>

      {hp ? (
        <div
          className="pointer-events-none absolute rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.15)]"
          style={{
            left: Math.min(Math.max((hover?.x ?? 0) / w, 0.1), 0.9) * 100 + "%",
            top: 12,
            transform: "translateX(-50%)",
          }}
        >
          <div className="text-slate-500">{prepared.fmtDate(hp.t)}</div>
          <div className="mt-0.5 font-semibold">{formatCzk(hp.v)}</div>
          {pointDeltaPct != null && (
            <div className="mt-0.5 text-slate-500">
              proti předchozímu bodu:{" "}
              <span className="text-slate-900">
                {pointDeltaPct >= 0 ? "+" : ""}
                {formatNum(pointDeltaPct, 2)} %
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChangeChip({ label, value }: { label: string; value: number | null | undefined }) {
  const dir = value == null ? "flat" : value > 0 ? "up" : value < 0 ? "down" : "flat";

  const cls = "border-slate-300 bg-white text-slate-900";

  const sign = dir === "up" ? "▲" : dir === "down" ? "▼" : "";

  return (
    <div className={["rounded-full border px-3 py-1 text-xs font-semibold tracking-wide", cls].join(" ")}>
      <span className="text-slate-600">{label}</span>
      <span className="mx-2 text-slate-600">•</span>
      <span className="text-slate-900">{value == null ? "—" : `${sign} ${formatNum(Math.abs(value), 1)} %`}</span>
    </div>
  );
}

export default function GoldToolPage() {
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

  // historie – CZK / oz
  const [history, setHistory] = useState<Point[]>([]);
  // fallback série (kdyby historie nepřišla) – CZK / oz
  const [series, setSeries] = useState<Point[]>([]);

  const [changes, setChanges] = useState<GoldApiResponse["changes"] | null>(null);

  const timerRef = useRef<number | null>(null);
  const secondRef = useRef<number | null>(null);

  const selected = UNITS[unit];

  const czkForSelectedUnit = useMemo(() => {
    if (czkPerOz == null) return null;
    return (czkPerOz / OUNCE_G) * selected.grams;
  }, [czkPerOz, selected.grams]);

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

  const loadTick = async () => {
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
  };

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
  }, [range]);

  useEffect(() => {
    if (secondRef.current) window.clearInterval(secondRef.current);
    secondRef.current = window.setInterval(() => {
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

  return (
    <AppLayout active="tools">
      <div className="w-full bg-white px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-6 font-mono text-slate-900">
          <header className="flex flex-col gap-2">
            <SplitTitle text="Zlato" className="!text-slate-900" />
            <Link href="/pomucky" className="inline-flex items-center text-xs text-slate-600 transition hover:text-slate-900">
              ← Zpět na pomůcky
            </Link>
          </header>

          <section className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Aktuální cena</h2>
                <p className="text-xs text-slate-600">
                  Zobrazení v CZK. Aktuální cena se obnovuje cca 1× za minutu.
                </p>
              </div>
              <div className="sm:justify-end">
                <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-300 bg-slate-100 p-1">
                  {(Object.keys(UNITS) as UnitKey[]).map((k) => {
                    const active = unit === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setUnit(k)}
                        className={[
                          "whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition",
                          active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-white",
                        ].join(" ")}
                      >
                        {UNITS[k].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {err ? (
              <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {err}
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-[28px] border border-slate-300 bg-slate-100 px-5 py-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_360px] md:items-start">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Cena ({selected.label})</div>
                    <div className="text-6xl font-semibold leading-none tracking-tight text-slate-900 sm:text-7xl lg:text-[5.25rem]">
                      {loading ? "Načítám…" : formatCzk(displayPrice ?? czkForSelectedUnit)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {lastUpdated ? `Aktualizováno: ${lastUpdated.toLocaleString("cs-CZ")}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          isStale ? "border-slate-300 bg-white text-slate-600" : "border-emerald-700 bg-emerald-600 text-white",
                        ].join(" ")}
                      >
                        {isStale ? "Stale snapshot" : "Live data"}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                        Další auto-refresh za {secondsToRefresh}s
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={manualRefresh}
                        disabled={loading || loadingRange || refreshingNow}
                        className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {refreshingNow ? "Obnovuji…" : "Obnovit teď"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Nárůst / pokles (CZK / unce)</div>
                    <div className="grid grid-cols-2 gap-2">
                      <ChangeChip label="1 den" value={changes?.d1} />
                      <ChangeChip label="3 měsíce" value={changes?.m3} />
                      <ChangeChip label="1 rok" value={changes?.y1} />
                      <ChangeChip label="2 roky" value={changes?.y2} />
                      <ChangeChip label="3 roky" value={changes?.y3} />
                      <ChangeChip label="5 let" value={changes?.y5} />
                      <ChangeChip label="10 let" value={changes?.y10} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      Graf ({RANGES[range].label})
                      {loadingRange ? <span className="ml-2 text-slate-500">• načítám…</span> : null}
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

                  <GoldChart points={chartPoints} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 py-3 text-[12px] text-slate-600">
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
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
