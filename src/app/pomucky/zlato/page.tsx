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

  // historická data (preferované)
  history?: Point[];

  // fallback historie (když backend vrací jiný tvar)
  czkSeries?: any[];

  changes?: {
    y1?: number;
    y2?: number;
    y3?: number;
    y5?: number;
    y10?: number;
  };
  changesPct?: {
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
  oz: { label: "Unce", grams: OUNCE_G },
  g50: { label: "50 g", grams: 50 },
} as const;

const RANGES = {
  w1: { label: "1 týden", days: 7 },
  m3: { label: "3 měsíce", days: 92 },
  y1: { label: "1 rok", days: 366 },
  y3: { label: "3 roky", days: 3 * 366 },
  y5: { label: "5 let", days: 5 * 366 },
  y10: { label: "10 let", days: 10 * 366 },
} as const;

type UnitKey = keyof typeof UNITS;
type RangeKey = keyof typeof RANGES;

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
  if (!r.ok) {
    throw new Error("Nepodařilo se načíst data o zlatě (API).");
  }

  const j = (await r.json()) as GoldApiResponse;

  if (j?.ok !== true) {
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
  const changes =
    j.changes ??
    (fromPct
      ? {
          y1: Number.isFinite(Number(fromPct["1y"])) ? Number(fromPct["1y"]) : undefined,
          y2: Number.isFinite(Number(fromPct["2y"])) ? Number(fromPct["2y"]) : undefined,
          y3: Number.isFinite(Number(fromPct["3y"])) ? Number(fromPct["3y"]) : undefined,
          y5: Number.isFinite(Number(fromPct["5y"])) ? Number(fromPct["5y"]) : undefined,
          y10: Number.isFinite(Number(fromPct["10y"])) ? Number(fromPct["10y"]) : undefined,
        }
      : undefined);

  return { usdPerOz, usdCzk, czkPerOz, ts, history, changes };
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

    const yTicks = [0, 0.5, 1].map((k) => {
      const v = minV + (1 - k) * spanV;
      return { y: pad.t + k * innerH, v };
    });

    const xTicks = [0, 0.5, 1].map((k) => {
      const t = minT + k * spanT;
      return { x: pad.l + k * innerW, t };
    });

    return { pts, lineD, areaD, baseY, yTicks, xTicks, fmtDate, minV, maxV, minT, maxT, xOfT, yOfV };
  }, [points]);

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
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-300">
        Nemám historická data pro graf (API nevrátilo dost bodů). Zkus přepnout rozsah.
      </div>
    );
  }

  const hp = hover ? prepared.pts[hover.idx] : null;

  return (
    <div className="relative rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4">
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
        <g className="text-white/10" stroke="currentColor" strokeWidth="1">
          {prepared.yTicks.map((t, i) => (
            <line key={`gy-${i}`} x1={pad.l} y1={t.y} x2={w - pad.r} y2={t.y} />
          ))}
          {prepared.xTicks.map((t, i) => (
            <line key={`gx-${i}`} x1={t.x} y1={pad.t} x2={t.x} y2={h - pad.b} />
          ))}
        </g>

        {/* y labels */}
        <g className="fill-slate-300" fontSize="11">
          {prepared.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={10} y={t.y + 4} opacity={0.9}>
              {formatCzk(t.v)}
            </text>
          ))}
        </g>

        {/* x labels */}
        <g className="fill-slate-300" fontSize="11">
          {prepared.xTicks.map((t, i) => (
            <text
              key={`xl-${i}`}
              x={t.x}
              y={h - 10}
              textAnchor={i === 0 ? "start" : i === 1 ? "middle" : "end"}
              opacity={0.9}
            >
              {prepared.fmtDate(t.t)}
            </text>
          ))}
        </g>

        {/* area + line */}
        <g className="text-emerald-200">
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

        {/* hover */}
        {hp ? (
          <g>
            <line x1={hp.x} y1={pad.t} x2={hp.x} y2={h - pad.b} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            <circle cx={hp.x} cy={hp.y} r={4} fill="rgba(167,243,208,0.95)" stroke="rgba(16,185,129,0.65)" />
          </g>
        ) : null}
      </svg>

      {hp ? (
        <div
          className="pointer-events-none absolute rounded-2xl border border-white/15 bg-slate-950/55 backdrop-blur-xl px-3 py-2 text-xs text-slate-100 shadow-[0_18px_60px_rgba(0,0,0,0.65)]"
          style={{
            left: Math.min(Math.max(hover!.x / w, 0), 1) * 100 + "%",
            top: 12,
            transform: "translateX(-50%)",
          }}
        >
          <div className="text-slate-300">{prepared.fmtDate(hp.t)}</div>
          <div className="mt-0.5 font-semibold">{formatCzk(hp.v)}</div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-100">{value}</div>
    </div>
  );
}

function ChangeChip({ label, value }: { label: string; value: number | null | undefined }) {
  const dir = value == null ? "flat" : value > 0 ? "up" : value < 0 ? "down" : "flat";

  const cls =
    value == null
      ? "border-white/10 bg-white/5 text-slate-200"
      : dir === "up"
        ? "border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
        : dir === "down"
          ? "border-rose-300/30 bg-rose-500/15 text-rose-100"
          : "border-white/10 bg-white/5 text-slate-200";

  const sign = dir === "up" ? "▲" : dir === "down" ? "▼" : "";

  return (
    <div className={["rounded-full border px-3 py-1 text-xs font-semibold tracking-wide", cls].join(" ")}>
      <span className="text-slate-200/90">{label}</span>
      <span className="mx-2 text-white/30">•</span>
      <span className="text-slate-50">{value == null ? "—" : `${sign} ${formatNum(Math.abs(value), 1)} %`}</span>
    </div>
  );
}

export default function GoldToolPage() {
  const [unit, setUnit] = useState<UnitKey>("oz");
  const [range, setRange] = useState<RangeKey>("y1");
  const [loadingRange, setLoadingRange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [usdPerOz, setUsdPerOz] = useState<number | null>(null);
  const [usdCzk, setUsdCzk] = useState<number | null>(null);
  const [czkPerOz, setCzkPerOz] = useState<number | null>(null);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // historie – CZK / oz
  const [history, setHistory] = useState<Point[]>([]);
  // fallback série (kdyby historie nepřišla) – CZK / oz
  const [series, setSeries] = useState<Point[]>([]);

  const [changes, setChanges] = useState<GoldApiResponse["changes"] | null>(null);

  const timerRef = useRef<number | null>(null);

  const selected = UNITS[unit];

  const czkForSelectedUnit = useMemo(() => {
    if (czkPerOz == null) return null;
    return (czkPerOz / OUNCE_G) * selected.grams;
  }, [czkPerOz, selected.grams]);

  // graf kopíruje vybranou jednotku
  const chartPoints: Point[] = useMemo(() => {
    const base = history.length >= 2 ? history : series;
    if (!base.length) return [];

    const factor = selected.grams / OUNCE_G;
    return base.map((p) => ({ t: p.t, v: p.v * factor }));
  }, [history, series, selected.grams]);

  const loadInitial = async (days: number) => {
    const snap = await fetchGold({ days, range });

    setUsdCzk(snap.usdCzk);
    setUsdPerOz(snap.usdPerOz);
    setCzkPerOz(snap.czkPerOz);
    setLastUpdated(new Date(snap.ts));

    if (snap.history?.length) setHistory(snap.history);
    else setHistory([]);

    setChanges(snap.changes ?? null);

    // fallback (jen aby UI neumřelo, když historie není)
    setSeries([{ t: snap.ts, v: snap.czkPerOz }]);
  };

  const loadTick = async () => {
    const snap = await fetchGold({ days: 0 });

    setUsdCzk(snap.usdCzk);
    setUsdPerOz(snap.usdPerOz);
    setCzkPerOz(snap.czkPerOz);
    setLastUpdated(new Date(snap.ts));

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
        await loadInitial(RANGES[range].days);
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

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="flex flex-col gap-2">
          <SplitTitle text="Zlato" />
          <Link href="/pomucky" className="inline-flex items-center text-xs text-slate-300 hover:text-white transition">
            ← Zpět na pomůcky
          </Link>
        </header>

        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Aktuální cena</h2>
              <p className="text-xs text-slate-300">
                Zobrazení v CZK. Přepínej jednotky (g / unce). Graf je historický dle vybraného rozsahu, aktuální cena se
                obnovuje cca 1× za minutu.
              </p>
            </div>

            <div className="flex gap-2 sm:justify-end flex-wrap">
              {(Object.keys(UNITS) as UnitKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setUnit(k)}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold border transition",
                    unit === k
                      ? "border-emerald-200/80 bg-emerald-500/20 text-emerald-50 shadow-[0_0_22px_rgba(16,185,129,0.35)]"
                      : "border-white/15 bg-white/5 text-slate-100 hover:bg-white/10",
                  ].join(" ")}
                >
                  {UNITS[k].label}
                </button>
              ))}
            </div>
          </div>

          {err ? (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-900/30 px-4 py-3 text-sm text-amber-100">
              {err}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-white/10 bg-slate-950/40 px-5 py-5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Cena ({selected.label})</div>
              <div className="mt-2 text-3xl sm:text-4xl font-semibold text-white">
                {loading ? "Načítám…" : formatCzk(czkForSelectedUnit)}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {lastUpdated ? `Aktualizováno: ${lastUpdated.toLocaleString("cs-CZ")}` : ""}
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
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
                          "rounded-full px-3 py-1.5 text-xs font-semibold border transition",
                          range === k
                            ? "border-emerald-200/80 bg-emerald-500/20 text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.25)]"
                            : "border-white/15 bg-white/5 text-slate-100 hover:bg-white/10",
                        ].join(" ")}
                      >
                        {RANGES[k].label}
                      </button>
                    ))}
                  </div>
                </div>

                <GoldChart points={chartPoints} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Nárůst / pokles (CZK / unce)</div>
                <div className="flex flex-wrap gap-2">
                  <ChangeChip label="1 rok" value={changes?.y1} />
                  <ChangeChip label="2 roky" value={changes?.y2} />
                  <ChangeChip label="3 roky" value={changes?.y3} />
                  <ChangeChip label="5 let" value={changes?.y5} />
                  <ChangeChip label="10 let" value={changes?.y10} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Zlato (CZK / unce)" value={formatCzk(czkPerOz)} />
                <Field label="Zlato (USD / unce)" value={usdPerOz == null ? "—" : `${formatNum(usdPerOz, 2)} USD`} />
                <Field label="Kurz USD/CZK" value={usdCzk == null ? "—" : `${formatNum(usdCzk, 3)} CZK`} />
                <Field label="Cena (CZK / 1 g)" value={czkPerOz == null ? "—" : formatCzk(czkPerOz / OUNCE_G)} />
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-[12px] text-slate-300">
                <span className="text-slate-300">Data jsou orientační.</span>

                <span className="relative group">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[12px] font-bold text-slate-100/90 shadow-[0_0_18px_rgba(255,255,255,0.06)]"
                    aria-label="Info"
                    title=""
                  >
                    i
                  </span>

                  <span className="pointer-events-none absolute right-0 top-0 z-10 hidden w-[320px] -translate-y-[calc(100%+10px)] rounded-2xl border border-white/15 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 shadow-[0_18px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl group-hover:block">
                    Zdroj: /api/gold (server-side). Spot XAU (USD/oz) + USD/CZK + historie (CZK/oz). Výstup je pouze
                    informativní.
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}