"use client";

import { ChartNoAxesCombined, Coins, Gem, Info, Moon, ShieldCheck, Sun, TrendingDown, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

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
    const coords = sampled.map((point, index) => {
      const x = left + (index / (sampled.length - 1)) * (right - left);
      const y = bottom - ((point.v - min + spread * 0.08) / (spread * 1.16)) * (bottom - top);
      return [x, y] as const;
    });
    const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L ${right} ${bottom} L ${left} ${bottom} Z`;

    return {
      line,
      area,
      from: new Date(sampled[0].t * 1000).getFullYear(),
      to: new Date((sampled.at(-1)?.t ?? sampled[0].t) * 1000).getFullYear(),
    };
  }, [points]);

  if (!chart) {
    return <div className={`flex h-[236px] items-center justify-center text-sm ${lightMode ? "text-amber-900/60" : "text-amber-50/60"}`}>Načítám desetiletou historii…</div>;
  }

  return (
    <div className={`relative h-[164px] w-full overflow-hidden rounded-xl px-2 py-2 shadow-[inset_0_0_0_1px_rgba(253,230,138,0.08)] sm:h-[196px] ${lightMode ? "bg-white/80 shadow-[inset_0_0_0_1px_rgba(146,64,14,0.14),0_12px_30px_rgba(88,28,135,0.08)]" : "bg-[#0a0715]/72"}`}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:linear-gradient(rgba(253,230,138,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(253,230,138,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
      <svg className="relative h-full w-full" viewBox="0 0 1000 280" preserveAspectRatio="none" role="img" aria-label="Vývoj ceny zlata za posledních deset let">
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
      </svg>
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
  const lightMode = theme === "light";
  const updatedLabel = getUpdatedLabel(data);
  const primaryTextClass = lightMode ? "text-slate-950" : "text-white";
  const bodyTextClass = lightMode ? "text-slate-600" : "text-violet-50/74";
  const labelTextClass = lightMode ? "text-amber-800/75" : "text-amber-100/75";
  const subtleTextClass = lightMode ? "text-slate-500" : "text-violet-100/55";

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
    <main className={`min-h-full px-5 py-8 transition-colors duration-300 sm:px-10 sm:py-12 ${lightMode ? "bg-[radial-gradient(circle_at_92%_8%,rgba(245,158,11,0.2),transparent_22%),radial-gradient(circle_at_8%_42%,rgba(124,58,237,0.11),transparent_34%),linear-gradient(145deg,#fffbeb_0%,#faf5ff_53%,#ffffff_100%)] text-slate-950" : "bg-[radial-gradient(circle_at_92%_8%,rgba(245,158,11,0.16),transparent_22%),radial-gradient(circle_at_8%_42%,rgba(124,58,237,0.16),transparent_34%),linear-gradient(145deg,#0b0717_0%,#110a22_53%,#080610_100%)] text-white"}`}>
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
                <p className={`border-l border-violet-500/55 pl-4 text-sm leading-relaxed ${bodyTextClass}`}><strong className={`block text-base ${primaryTextClass}`}>Spořicí plán od 500 Kč měsíčně</strong>Každá platba se ihned promítá do poměrné části investičního zlata — není nutné nejdříve spořit na celý slitek.</p>
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
          </aside>
        </div>

        <footer className={`py-5 text-[11px] leading-relaxed ${lightMode ? "text-slate-500" : "text-violet-100/52"}`}>Historická výkonnost není zárukou budoucích výnosů. Investici vždy vybíráme podle vaší situace a cíle.</footer>
      </article>
    </main>
  );
}
