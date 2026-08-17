"use client";

import { CalendarDays, ChartNoAxesCombined, CheckCircle2, Coins, Gem, Info, Moon, ShieldCheck, Sun, TrendingDown, TrendingUp, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";

type GoldPoint = { t: number; v: number };
type GoldResponse = {
  ok: boolean;
  history?: GoldPoint[];
  changesPct?: {
    "1m"?: number;
    "1y"?: number;
    "3y"?: number;
    "5y"?: number;
    "10y"?: number;
  };
  asOfDate?: string;
  updatedAt?: string;
  ts?: number;
  stale?: boolean;
  error?: string;
  message?: string;
};

const PERIODS = [
  { label: "1 měsíc", key: "1m" },
  { label: "1 rok", key: "1y" },
  { label: "3 roky", key: "3y" },
  { label: "5 let", key: "5y" },
  { label: "10 let", key: "10y" },
] as const;

const formatPercent = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
};

const formatGoldPrice = (value: number) => `${Math.round(value).toLocaleString("cs-CZ")} Kč/oz`;

const formatChartDate = (timestamp: number) => new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(timestamp * 1000);

const formatUpdatedAt = (value: string | undefined) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
};

const getUpdatedLabel = (data: GoldResponse | null) => {
  const fromUpdatedAt = formatUpdatedAt(data?.updatedAt);
  if (fromUpdatedAt) return fromUpdatedAt;
  if (typeof data?.ts === "number" && Number.isFinite(data.ts)) {
    return new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(data.ts);
  }
  return null;
};

function GoldLineChart({ points, lightMode }: { points: GoldPoint[]; lightMode: boolean }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chart = useMemo(() => {
    const clean = points
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v) && point.v > 0)
      .sort((a, b) => a.t - b.t);
    const maxPoints = 260;
    const step = Math.max(1, Math.ceil(clean.length / maxPoints));
    const sampled = clean.filter((_, index) => index % step === 0 || index === clean.length - 1);
    if (sampled.length < 2) return null;

    const values = sampled.map((point) => point.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, Math.max(max * 0.05, 1));
    const left = 26;
    const right = 974;
    const top = 18;
    const bottom = 252;
    const plottedPoints = sampled.map((point, index) => {
      const x = left + (index / (sampled.length - 1)) * (right - left);
      const y = bottom - ((point.v - min + spread * 0.08) / (spread * 1.16)) * (bottom - top);
      return { ...point, x, y };
    });
    const line = plottedPoints.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L ${right} ${bottom} L ${left} ${bottom} Z`;

    return {
      line,
      area,
      points: plottedPoints,
      from: new Date(sampled[0].t * 1000).getFullYear(),
      to: new Date((sampled.at(-1)?.t ?? sampled[0].t) * 1000).getFullYear(),
    };
  }, [points]);

  if (!chart) {
    return <div className={`flex h-[236px] items-center justify-center text-sm ${lightMode ? "text-amber-900/60" : "text-amber-50/60"}`}>Načítám desetiletou historii…</div>;
  }

  const hoveredPoint = hoveredIndex === null ? null : chart.points[hoveredIndex] ?? null;
  const latestPoint = chart.points.at(-1) ?? null;
  const updateHoveredPoint = (clientX: number, svg: SVGSVGElement) => {
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width) return;
    const cursorX = ((clientX - bounds.left) / bounds.width) * 1000;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    chart.points.forEach((point, index) => {
      const distance = Math.abs(point.x - cursorX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setHoveredIndex(closestIndex);
  };

  return (
    <div className={`relative h-[164px] w-full overflow-hidden rounded-xl px-2 py-2 shadow-[inset_0_0_0_1px_rgba(253,230,138,0.08)] sm:h-[196px] ${lightMode ? "bg-white/80 shadow-[inset_0_0_0_1px_rgba(146,64,14,0.14),0_12px_30px_rgba(88,28,135,0.08)]" : "bg-[#0a0715]/72"}`}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:linear-gradient(rgba(253,230,138,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(253,230,138,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
      <svg
        className="relative h-full w-full touch-none"
        viewBox="0 0 1000 280"
        preserveAspectRatio="none"
        role="img"
        aria-label="Vývoj ceny zlata za posledních deset let"
        onPointerMove={(event) => updateHoveredPoint(event.clientX, event.currentTarget)}
        onPointerDown={(event) => updateHoveredPoint(event.clientX, event.currentTarget)}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id="gold-chart-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="0.5" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#fff7cc" />
          </linearGradient>
          <linearGradient id="gold-chart-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fbbf24" stopOpacity="0.34" />
            <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
          <filter id="gold-chart-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={chart.area} fill="url(#gold-chart-area)" />
        <path d={chart.line} fill="none" stroke="url(#gold-chart-stroke)" strokeWidth="4" vectorEffect="non-scaling-stroke" filter="url(#gold-chart-glow)" />
        {hoveredPoint ? (
          <g pointerEvents="none">
            <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1="12" y2="252" stroke={lightMode ? "rgba(146,64,14,0.36)" : "rgba(253,230,138,0.36)"} strokeDasharray="5 6" vectorEffect="non-scaling-stroke" />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="9" fill={lightMode ? "rgba(255,255,255,0.92)" : "rgba(10,7,21,0.9)"} stroke="#fbbf24" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </g>
        ) : null}
      </svg>
      {latestPoint ? (
        <div
          className={`pointer-events-none absolute right-3 z-10 -translate-y-1/2 rounded-lg border px-2.5 py-1.5 text-right shadow-lg backdrop-blur-md ${lightMode ? "border-amber-300/70 bg-white/88 text-amber-950" : "border-amber-100/25 bg-[#120b1d]/86 text-amber-50"}`}
          style={{ top: `${Math.max(14, Math.min(68, (latestPoint.y / 280) * 100))}%` }}
        >
          <span className={`block text-[9px] font-semibold uppercase tracking-[0.12em] ${lightMode ? "text-amber-800/65" : "text-amber-100/62"}`}>Aktuálně</span>
          <span className="block text-xs font-bold tracking-[-0.02em]">{formatGoldPrice(latestPoint.v)}</span>
        </div>
      ) : null}
      {hoveredPoint ? (
        <div
          className={`pointer-events-none absolute z-20 -translate-y-1/2 rounded-xl border px-3 py-2 shadow-[0_14px_28px_rgba(8,6,16,0.3)] backdrop-blur-md ${hoveredPoint.x > 700 ? "-ml-2 -translate-x-full text-right" : "ml-2 text-left"} ${lightMode ? "border-amber-300/70 bg-white/92 text-amber-950" : "border-amber-100/25 bg-[#120b1d]/92 text-white"}`}
          style={{ left: `${(hoveredPoint.x / 1000) * 100}%`, top: `${Math.max(18, Math.min(66, (hoveredPoint.y / 280) * 100))}%` }}
        >
          <span className={`block text-[10px] font-semibold ${lightMode ? "text-amber-800/70" : "text-amber-100/68"}`}>{formatChartDate(hoveredPoint.t)}</span>
          <span className="mt-0.5 block text-sm font-bold tracking-[-0.02em]">{formatGoldPrice(hoveredPoint.v)}</span>
        </div>
      ) : null}
      <div className={`pointer-events-none absolute inset-x-5 bottom-3 flex justify-between text-[10px] font-semibold uppercase tracking-[0.16em] ${lightMode ? "text-amber-900/55" : "text-amber-50/55"}`}>
        <span>{chart.from}</span>
        <span>{chart.to}</span>
      </div>
    </div>
  );
}

export default function GoldInvestmentEmbedPage() {
  const [data, setData] = useState<GoldResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingSubmitted, setMeetingSubmitted] = useState(false);
  const [meetingAdvisorSlug, setMeetingAdvisorSlug] = useState<string | null>(null);
  const lightMode = theme === "light";
  const updatedLabel = getUpdatedLabel(data);
  const primaryTextClass = lightMode ? "text-slate-950" : "text-white";
  const bodyTextClass = lightMode ? "text-slate-600" : "text-violet-50/74";
  const labelTextClass = lightMode ? "text-amber-800/75" : "text-amber-100/75";
  const subtleTextClass = lightMode ? "text-slate-500" : "text-violet-100/55";

  const openGoldMeetingModal = () => {
    const advisorSlug = new URLSearchParams(window.location.search).get("advisor")?.trim() ?? "";
    if (!/^[a-z0-9-]+$/i.test(advisorSlug)) return;
    setMeetingAdvisorSlug(advisorSlug);
    setMeetingSubmitted(false);
    setMeetingModalOpen(true);
  };

  useEffect(() => {
    if (!meetingModalOpen) return;

    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [meetingModalOpen]);

  useEffect(() => {
    const controller = new AbortController();

    const loadGoldData = () => void fetch("/api/gold?range=y10&days=3652", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as GoldResponse | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || payload?.error || "Živá data se nepodařilo načíst.");
        }
        setData(payload);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Živá data se nepodařilo načíst.");
      });

    loadGoldData();
    const refreshId = window.setInterval(loadGoldData, 60_000);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, []);

  return (
    <main className={`min-h-full overflow-x-hidden px-5 py-8 transition-colors duration-300 sm:px-10 sm:py-12 ${lightMode ? "bg-[radial-gradient(circle_at_92%_8%,rgba(245,158,11,0.2),transparent_22%),radial-gradient(circle_at_8%_42%,rgba(124,58,237,0.11),transparent_34%),linear-gradient(145deg,#fffbeb_0%,#faf5ff_53%,#ffffff_100%)] text-slate-950" : "bg-[radial-gradient(circle_at_92%_8%,rgba(245,158,11,0.16),transparent_22%),radial-gradient(circle_at_8%_42%,rgba(124,58,237,0.16),transparent_34%),linear-gradient(145deg,#0b0717_0%,#110a22_53%,#080610_100%)] text-white"}`}>
      <article className="mx-auto max-w-[1440px]">
        <div className="flex justify-end pb-2">
          <div className={`inline-flex items-center rounded-full border p-1 text-xs font-bold shadow-[0_10px_20px_rgba(15,23,42,0.14)] ${lightMode ? "border-violet-200 bg-white/90 text-slate-700" : "border-white/16 bg-slate-950/42 text-violet-100"}`} aria-label="Vzhled stránky">
            <button type="button" onClick={() => setTheme("dark")} aria-pressed={!lightMode} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${!lightMode ? "bg-violet-700 text-white shadow-[0_8px_22px_rgba(124,58,237,0.34)]" : "hover:bg-violet-50"}`}>
              <Moon className="h-3.5 w-3.5" />
              <span>Tmavý</span>
            </button>
            <button type="button" onClick={() => setTheme("light")} aria-pressed={lightMode} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${lightMode ? "bg-violet-700 text-white shadow-[0_8px_22px_rgba(124,58,237,0.34)]" : "hover:bg-white/10"}`}>
              <Sun className="h-3.5 w-3.5" />
              <span>Světlý</span>
            </button>
          </div>
        </div>
        <header className="relative">
          <div className="mx-auto grid max-w-[1280px] gap-10 py-6 pb-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(500px,0.85fr)] lg:items-center lg:gap-12 lg:py-8 lg:pb-10">
            <div className="max-w-[44rem]">
              <p className={`inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] ${labelTextClass}`}><Gem className="h-3.5 w-3.5" /> Investiční zlato a stříbro</p>
              <h1 className={`mt-4 max-w-3xl text-4xl font-bold leading-[0.9] tracking-[-0.065em] sm:text-6xl lg:text-[6rem] ${primaryTextClass}`}>Proč investovat<br className="hidden sm:block" /> do zlata?</h1>
              <p className={`mt-6 max-w-xl text-base leading-relaxed sm:text-lg ${bodyTextClass}`}>Fyzické zlato může doplnit portfolio o dlouhodobé, globálně obchodované aktivum. Vývoj sledujeme v českých korunách za trojskou unci.</p>
            </div>
            <div className="relative mx-auto h-72 w-full max-w-[560px] sm:h-80 sm:max-w-[500px] lg:h-[352px]">
              <div className="absolute inset-x-8 inset-y-4 rounded-full bg-amber-300/[0.14] blur-3xl" />
              <Image src="/images/investicni-zlato-pamp.png" alt="Dva investiční zlaté slitky PAMP" fill sizes="(min-width: 640px) 500px, 560px" className="relative rotate-[30deg] object-contain drop-shadow-[0_24px_32px_rgba(0,0,0,0.52)]" priority />
            </div>
          </div>
        </header>

        <div className="grid gap-12 py-10 lg:grid-cols-[minmax(0,1.06fr)_minmax(360px,0.94fr)] lg:gap-16 lg:py-12">
          <section className="order-2">
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><ShieldCheck className="h-4 w-4" /> Zlato v portfoliu</p>
            <div className="mt-6 space-y-5">
              {[
                ["01", "Diverzifikace portfolia", "Aktivum s odlišným vývojem než běžné finanční trhy."],
                ["02", "Ochrana kupní síly", "Dlouhodobý prvek portfolia v období nejistoty a inflace."],
                ["03", "Fyzické a likvidní aktivum", "Majetek, který je možné držet a obchodovat globálně."],
                ["04", "Bezpečný přístav v krizi", "V době válek, politické nestability nebo pádu akciových trhů cena zlata často roste."],
                ["05", "Daňové výhody", "Investiční zlato je při splnění zákonných podmínek osvobozeno od DPH; u fyzických osob je příjem z prodeje zpravidla osvobozen od daně z příjmů, pokud zlato neslouží k podnikání."],
              ].map(([number, title, detail]) => (
                <div key={title} className="grid grid-cols-[34px_minmax(0,1fr)] gap-4 py-1">
                  <span className={`pt-0.5 text-[10px] font-semibold tracking-[0.18em] ${lightMode ? "text-amber-700/75" : "text-amber-200/70"}`}>{number}</span>
                  <p className={`text-sm leading-relaxed sm:text-[15px] ${bodyTextClass}`}><strong className={`block text-base font-semibold sm:text-lg ${primaryTextClass}`}>{title}</strong>{detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 pt-2">
              <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><Coins className="h-4 w-4" /> Jak lze investovat</p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <p className={`border-l border-amber-500/55 pl-4 text-sm leading-relaxed ${bodyTextClass}`}><strong className={`block text-base ${primaryTextClass}`}>Jednorázový nákup</strong>Pro chvíli, kdy chcete část prostředků převést do fyzického zlata.</p>
                <p className={`border-l border-violet-500/55 pl-4 text-sm leading-relaxed ${bodyTextClass}`}><strong className={`block text-base ${primaryTextClass}`}>Spořicí plány od 500 Kč měsíčně</strong>S každou platbou nakoupíte poměrnou část zlata. Tím se liší od klasického spoření. Po dospoření obdržíte vámi zvolený slitek.</p>
              </div>
            </div>
            <div className={`mt-10 rounded-2xl p-5 ${lightMode ? "bg-amber-100/65" : "bg-amber-300/[0.07]"}`}>
              <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${labelTextClass}`}><Info className="h-4 w-4" /> Na co myslet před nákupem</p>
              <p className={`mt-3 text-sm leading-relaxed ${bodyTextClass}`}>Zlato je dlouhodobá investice a jeho cena může kolísat. Před nákupem vždy zvažte svůj investiční horizont, likviditu, rozdíl mezi nákupní a výkupní cenou i způsob úschovy. Zlato by mělo portfolio doplňovat, ne tvořit jeho převážnou část.</p>
            </div>
          </section>

          <aside className="order-1 lg:pr-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${labelTextClass}`}><ChartNoAxesCombined className="h-4 w-4" /> Výkon zlata v CZK / oz</p>
              <span className={`inline-flex items-center gap-1.5 text-xs ${subtleTextClass}`}>
                {data && !data.stale ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden="true" /> : null}
                {data?.stale ? "Poslední dostupná data" : data ? `Živá data${updatedLabel ? ` · ${updatedLabel}` : ""}` : "Načítám živá data…"}
              </span>
            </div>
            <div className="mt-4">
              <GoldLineChart points={data?.history ?? []} lightMode={lightMode} />
              {error ? <p className={`mt-3 text-xs ${lightMode ? "text-amber-800/70" : "text-amber-100/70"}`}>{error}</p> : null}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              {PERIODS.map(({ label, key }) => {
                const value = data?.changesPct?.[key];
                const trend = typeof value !== "number" ? "flat" : value > 0 ? "up" : value < 0 ? "down" : "flat";
                return (
                  <div key={key} className="flex items-end justify-between gap-2 py-2">
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${lightMode ? "text-slate-500" : "text-violet-100/52"}`}>{label}</p>
                      <p className={`mt-1 text-lg font-bold tracking-[-0.04em] ${typeof value !== "number" ? (lightMode ? "text-slate-500" : "text-white/70") : trend === "up" ? (lightMode ? "text-emerald-700" : "text-emerald-200") : trend === "down" ? (lightMode ? "text-rose-700" : "text-rose-200") : subtleTextClass}`}>{formatPercent(value)}</p>
                    </div>
                    {trend === "up" ? (
                      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${lightMode ? "bg-emerald-100 text-emerald-700" : "bg-emerald-300/12 text-emerald-200"}`} title="Růst">
                        <TrendingUp className="h-4 w-4" aria-hidden="true" />
                      </span>
                    ) : trend === "down" ? (
                      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${lightMode ? "bg-rose-100 text-rose-700" : "bg-rose-300/12 text-rose-200"}`} title="Pokles">
                        <TrendingDown className="h-4 w-4" aria-hidden="true" />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className={`mt-8 rounded-2xl p-4 ${lightMode ? "bg-slate-950/[0.035] shadow-[0_12px_32px_rgba(88,28,135,0.06)]" : "bg-white/[0.035]"}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-amber-800/65" : "text-amber-100/62"}`}>Partneři pro investiční zlato a stříbro</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="flex h-16 items-center justify-center rounded-xl bg-white px-4 shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
                  <Image src="/icons/cclogo1.png" alt="Comfort Commodity" width={1110} height={271} className="h-9 w-auto object-contain" />
                </div>
                <div className="flex h-16 items-center justify-center rounded-xl bg-[#0a0715]/90 px-4 shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
                  <Image src="/images/ekkagold.png" alt="Ekka Gold" width={1672} height={941} className="h-11 w-auto object-contain" />
                </div>
              </div>
            </div>
            <section className={`relative mt-5 min-h-[238px] overflow-hidden rounded-[2rem_2rem_2rem_0.65rem] p-7 sm:p-9 ${lightMode ? "bg-amber-100/65" : "bg-amber-300/[0.075]"}`}>
              <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-amber-300/[0.18] blur-[90px]" />
              <Image
                src="/images/investicni-zlato-slitky.png"
                alt="Zlaté slitky"
                width={1536}
                height={1024}
                className={`pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[54%] object-cover object-[58%_center] md:block ${lightMode ? "opacity-65 mix-blend-multiply" : "opacity-75"}`}
              />
              <div className={`pointer-events-none absolute inset-y-0 right-0 hidden w-[78%] md:block ${lightMode ? "bg-[linear-gradient(90deg,rgba(254,243,199,0)_0%,rgba(254,243,199,0.36)_42%,rgba(254,243,199,0.66)_100%)]" : "bg-[linear-gradient(90deg,rgba(19,11,10,0)_0%,rgba(19,11,10,0.14)_42%,rgba(19,11,10,0.42)_100%)]"}`} />
              <div className="relative flex min-h-[168px] flex-col items-start justify-between gap-7">
                <div className="max-w-xl md:max-w-[60%]">
                  <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><Gem className="h-4 w-4" /> Investiční zlato a stříbro</p>
                  <h2 className={`mt-4 text-3xl font-bold leading-[0.96] tracking-[-0.055em] sm:text-4xl ${primaryTextClass}`}>Zaujala vás investice do zlata? Pojďme se na to podívat.</h2>
                </div>
                <button
                  type="button"
                  onClick={openGoldMeetingModal}
                  className="online-card-action relative isolate inline-flex w-fit shrink-0 items-center gap-2 overflow-hidden rounded-full border border-white/35 bg-[linear-gradient(120deg,rgba(217,119,6,0.9)_0%,rgba(245,158,11,0.82)_55%,rgba(253,230,138,0.86)_100%)] px-6 py-3.5 text-sm font-bold text-[#1c1002] shadow-[0_18px_36px_rgba(245,158,11,0.28),inset_0_1px_0_rgba(255,255,255,0.52)] transition hover:brightness-110 hover:shadow-[0_20px_42px_rgba(245,158,11,0.36)] before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:h-px before:bg-white/90 before:opacity-80"
                >
                  <CalendarDays className="h-4 w-4" />
                  Sjednat schůzku
                </button>
              </div>
            </section>
          </aside>
        </div>

        <footer className={`py-5 text-[11px] leading-relaxed ${lightMode ? "text-slate-500" : "text-violet-100/52"}`}>Historická výkonnost není zárukou budoucích výnosů. Investici vždy vybíráme podle vaší situace a cíle.</footer>
      </article>

      {meetingModalOpen && meetingAdvisorSlug ? (
        <div className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-[#070512]/78 p-4 backdrop-blur-xl sm:p-6" role="dialog" aria-modal="true" aria-label="Sjednat schůzku">
          <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden rounded-[30px] border border-violet-300/25 bg-[#120a25] p-4 text-white shadow-[0_34px_100px_rgba(7,6,25,0.76),inset_0_1px_0_rgba(221,214,254,0.16)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[32px] sm:p-6">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-500/18 blur-[90px]" />
            <div className="pointer-events-none absolute -bottom-32 left-1/4 h-48 w-80 rounded-full bg-indigo-500/10 blur-[80px]" />
            <div className="relative flex shrink-0 items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200/25 bg-amber-400/15 text-amber-100 shadow-[0_10px_24px_rgba(245,158,11,0.2)]">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-100/80">Sjednat schůzku</p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-0.035em] text-white sm:text-2xl">Domluvte si termín</h2>
                  <p className="mt-1 text-sm leading-relaxed text-violet-100/70">Nechte na sebe kontakt a poradce se vám brzy ozve.</p>
                </div>
              </div>
              <button type="button" onClick={() => setMeetingModalOpen(false)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-violet-100 transition hover:rotate-90 hover:bg-white/[0.14]" aria-label="Zavřít formulář">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative max-h-[calc(100dvh-11rem)] overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {meetingSubmitted ? (
                <div className="mt-6 rounded-2xl border border-emerald-300/35 bg-emerald-400/14 px-4 py-4 text-emerald-50">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Žádost byla odeslána.</p>
                      <p className="mt-1 text-sm text-emerald-50/82">Děkujeme, brzy se vám ozveme.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <OnlineCardMeetingStepper
                  slug={meetingAdvisorSlug}
                  initialSelectedTopics={["precious-metals"]}
                  initialStep={1}
                  onSubmitted={() => setMeetingSubmitted(true)}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
