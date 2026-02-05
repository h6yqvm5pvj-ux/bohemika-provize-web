// src/app/pomucky/invalidita/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SplitTitle from "../plan-produkce/SplitTitle";
import { AppLayout } from "@/components/AppLayout";

const SCENARIOS = [
  { id: "veryLow", label: "Velmi nízké", ratios: [0.1, 0.2, 0.3] },
  { id: "low", label: "Nízké", ratios: [0.3, 0.5, 0.8] },
  { id: "medium", label: "Střední", ratios: [0.4, 0.6, 1.0] },
  { id: "high", label: "Vyšší", ratios: [0.5, 0.75, 1.2] },
] as const;

const DEGREE_LABELS = ["1. stupeň", "2. stupeň", "3. stupeň"];
const INVESTIKA_RETURN_RANGE = { min: 0.055, max: 0.06 };
const SCENARIO_STYLE: Record<
  (typeof SCENARIOS)[number]["id"],
  { panel: string; badge: string }
> = {
  veryLow: {
    panel: "from-black/70 via-black/65 to-black/60",
    badge: "border-emerald-300/60 text-emerald-100 bg-black/60",
  },
  low: {
    panel: "from-black/70 via-black/65 to-black/60",
    badge: "border-emerald-300/60 text-emerald-100 bg-black/60",
  },
  medium: {
    panel: "from-black/70 via-black/65 to-black/60",
    badge: "border-emerald-300/60 text-emerald-100 bg-black/60",
  },
  high: {
    panel: "from-black/70 via-black/65 to-black/60",
    badge: "border-emerald-300/60 text-emerald-100 bg-black/60",
  },
};

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function requiredCapitalForRenta(
  monthly: number,
  months: number,
  annualRate: number
): number {
  if (!Number.isFinite(monthly) || monthly <= 0 || months <= 0) return 0;
  if (!Number.isFinite(annualRate) || annualRate <= 0) {
    return monthly * months;
  }
  const r = annualRate / 12;
  const factor = (1 - Math.pow(1 + r, -months)) / r;
  return monthly * factor;
}

export default function InvaliditaPage() {
  const [age, setAge] = useState(35);
  const [ageInput, setAgeInput] = useState("35");
  const [netIncome, setNetIncome] = useState(32830);
  const [coverageYears, setCoverageYears] = useState(65 - 35);

  const maxCoverage = Math.max(0, 65 - age);
  const safeCoverageYears = Math.max(0, Math.min(coverageYears, maxCoverage));
  const totalMonths = safeCoverageYears * 12;

  const results = useMemo(() => {
    return SCENARIOS.map((scenario) => {
      const monthly = scenario.ratios.map((ratio) => Math.round(netIncome * ratio));
      const lump = monthly.map((m) => Math.round(m * totalMonths));
      return {
        id: scenario.id,
        label: scenario.label,
        monthly,
        lump,
        ratios: scenario.ratios,
      };
    });
  }, [netIncome, totalMonths]);

  const handleNumber = (val: string, fallback: number) => {
    const num = Number(val.replace(",", "."));
    return Number.isFinite(num) ? num : fallback;
  };

  useEffect(() => {
    // Auto-prefill coverage to remaining years to 65 whenever age changes
    setCoverageYears(Math.max(0, 65 - age));
  }, [age]);

  const disabled = totalMonths <= 0 || netIncome <= 0 || age <= 0;

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6">
        <header className="mb-2 space-y-2">
          <SplitTitle text="Kalkulačka Invalidita" />
          <p className="text-sm text-slate-300 max-w-2xl">
            Stanov pojistnou částku podle poklesu příjmu pro invaliditu 1., 2. a
            3. stupně. Zadáš věk, čistý příjem a délku krytí – uvidíš, kolik
            chybí měsíčně i celkově do 65 let.
          </p>
          <Link
            href="/pomucky"
            className="inline-flex items-center text-xs text-slate-300 hover:text-white transition"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.75)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Vstupní parametry
              </h2>
              <p className="text-xs text-slate-300">
                Věk, čistý příjem a délka krytí (maximálně do 65 let).
              </p>
            </div>
            <div className="text-xs text-slate-300">
              {totalMonths > 0
                ? `Počet měsíců: ${totalMonths.toLocaleString("cs-CZ")} (≈ ${safeCoverageYears} let)`
                : "Nastav věk a délku krytí"}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm text-slate-200">
              <span className="block text-xs uppercase tracking-wide text-slate-300">
                Věk klienta
              </span>
              <input
                type="number"
                value={ageInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  setAgeInput(raw);
                  if (raw === "") {
                    setAge(0);
                    return;
                  }
                  const v = handleNumber(raw, age);
                  setAge(Math.max(1, Math.round(v)));
                }}
                className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-400">
                Délka krytí se omezí do 65 let (max {maxCoverage} let).
              </p>
            </label>

            <label className="space-y-1 text-sm text-slate-200">
              <span className="block text-xs uppercase tracking-wide text-slate-300">
                Čistý měsíční příjem
              </span>
              <input
                type="number"
                min={0}
                value={netIncome}
                onChange={(e) => {
                  const v = handleNumber(e.target.value, netIncome);
                  setNetIncome(Math.max(0, Math.round(v)));
                }}
                className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-400">
                Částka, ze které počítáme pokrytí příjmu.
              </p>
            </label>

            <label className="space-y-1 text-sm text-slate-200">
              <span className="block text-xs uppercase tracking-wide text-slate-300">
                Délka krytí v letech
              </span>
              <input
                type="number"
                min={0}
                max={maxCoverage}
                value={safeCoverageYears}
                onChange={(e) => {
                  const v = handleNumber(e.target.value, safeCoverageYears);
                  setCoverageYears(Math.max(0, Math.min(maxCoverage, Math.round(v))));
                }}
                className="w-full rounded-xl bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-400">
                Maximálně do 65 let (zbývá {maxCoverage} let).
              </p>
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Výstup</h2>
              <p className="text-xs text-slate-300">
                Návrh pojistné částky pro každý stupeň invalidity v různých
                úrovních pokrytí příjmu.
              </p>
            </div>
            <div className="text-[11px] text-slate-400">
              Cílem je kompenzovat pokles schopnosti vydělávat.
            </div>
          </div>

          {disabled ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              Zadej věk, příjem a délku krytí (musí být kladná).
            </div>
          ) : (
            <div className="grid gap-3 lg:gap-4 md:grid-cols-2 xl:grid-cols-4">
              {results.map((scenario) => {
                const style = SCENARIO_STYLE[scenario.id];
                return (
                  <div
                    key={scenario.id}
                    className={`relative overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br ${style.panel} px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-3xl transition hover:border-emerald-300/40`}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/10 via-white/4 to-transparent" />
                    <div className="pointer-events-none absolute -left-12 -top-14 h-28 w-40 rotate-12 bg-white/18 blur-3xl opacity-70" />
                    <div className="pointer-events-none absolute -right-10 bottom-[-16px] h-20 w-32 rotate-6 bg-emerald-200/12 blur-2xl" />
                    <div className="relative z-10 mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">{scenario.label}</div>
                      <div className="text-[11px] text-slate-400">
                        Pokrytí: {scenario.ratios.map((r) => `${Math.round(r * 100)}%`).join(" / ")}
                      </div>
                    </div>

                    <div className="relative z-10 space-y-3">
                      {scenario.monthly.map((m, idx) => (
                        <div
                          key={`${scenario.id}-${idx}`}
                          className="relative overflow-hidden flex items-start justify-between rounded-lg border border-white/15 bg-gradient-to-br from-white/12 via-white/6 to-white/5 px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
                        >
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/12 via-white/4 to-transparent" />
                          <div className="pointer-events-none absolute -left-6 -top-8 h-16 w-20 rotate-12 bg-white/22 blur-2xl opacity-60" />
                          <div className="relative z-10 flex items-start justify-between w-full gap-3">
                            <div className="text-sm text-slate-200">
                              <div className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                {DEGREE_LABELS[idx]}
                              </div>
                              <div className="mt-1 text-base font-semibold text-emerald-200 leading-tight">
                                {formatMoney(m)} / měsíc
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {Math.round(scenario.ratios[idx] * 100)} % příjmu
                              </div>
                            </div>
                            <div className="text-right text-sm text-white leading-tight">
                              <div className="text-[11px] text-slate-400">Celkem</div>
                              <div className="text-[12px] font-semibold text-emerald-200/90 whitespace-nowrap">
                                {formatMoney(scenario.lump[idx])}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {!disabled && (
          <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.75)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Investice: INVESTIKA Realitní Fond
                </h3>
                <p className="text-xs text-slate-300">
                  Jak velkou pojistnou částku je třeba získat, aby šla pokrýt
                  požadovaná měsíční renta (stejná jako pokrytí příjmu) do 65
                  let při zhodnocení 5,5–6 % p.a. Výpočet používá měsíční
                  rentní čerpání včetně reinvestovaných výnosů.
                </p>
              </div>
              <div className="text-[11px] text-slate-400">
                Pouze ilustrativní výpočet, nejedná se o investiční
                doporučení.
              </div>
            </div>

            <div className="grid gap-3 lg:gap-4 md:grid-cols-2 xl:grid-cols-4">
              {results.map((scenario) => {
                const style = SCENARIO_STYLE[scenario.id];
                return (
                  <div
                    key={`investika-${scenario.id}`}
                    className={`relative overflow-hidden rounded-xl border border-white/20 bg-gradient-to-br ${style.panel} px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-3xl transition hover:border-emerald-300/40`}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/10 via-white/4 to-transparent" />
                    <div className="pointer-events-none absolute -left-16 -top-16 h-32 w-48 rotate-12 bg-white/18 blur-3xl opacity-70" />
                    <div className="pointer-events-none absolute -right-10 bottom-[-18px] h-24 w-32 rotate-3 bg-emerald-200/15 blur-2xl" />
                    <div className="relative z-10 mb-4 flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {scenario.label}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Cíl: renta z investice
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${style.badge}`}
                      >
                        5,5–6 % p.a.
                      </span>
                    </div>

                    <div className="relative z-10 space-y-3">
                      {scenario.monthly.map((m, idx) => {
                        const minCapital = Math.round(
                          requiredCapitalForRenta(
                            m,
                            totalMonths,
                            INVESTIKA_RETURN_RANGE.max
                          )
                        );
                        const maxCapital = Math.round(
                          requiredCapitalForRenta(
                            m,
                            totalMonths,
                            INVESTIKA_RETURN_RANGE.min
                          )
                        );

                        return (
                          <div
                            key={`investika-${scenario.id}-${idx}`}
                            className="relative overflow-hidden rounded-lg border border-white/15 bg-gradient-to-br from-white/12 via-white/6 to-white/4 px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
                          >
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/12 via-white/4 to-transparent" />
                            <div className="pointer-events-none absolute -left-8 -top-10 h-16 w-24 rotate-12 bg-white/24 blur-2xl opacity-60" />
                            <div className="flex items-start justify-between gap-3 relative z-10">
                              <div className="text-sm text-slate-200">
                                <div className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                  {DEGREE_LABELS[idx]}
                                </div>
                                <div className="mt-2 text-lg font-semibold text-emerald-200 leading-tight">
                                  {formatMoney(m)}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Měsíční renta
                                </div>
                              </div>
                              <div className="text-right text-sm text-white leading-tight">
                                <div className="text-[11px] text-slate-400">
                                  Potřebný vklad
                                </div>
                                <div className="text-[12px] font-semibold text-emerald-200/90 whitespace-nowrap">
                                  {formatMoney(minCapital)}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  až
                                </div>
                                <div className="text-[12px] font-semibold text-emerald-200/90 whitespace-nowrap">
                                  {formatMoney(maxCapital)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.75)] space-y-3">
          <h3 className="text-sm font-semibold text-white uppercase tracking-[0.18em]">
            Metodika
          </h3>
          <ul className="text-sm text-slate-200 space-y-1 list-disc list-inside">
            <li>
              1. stupeň: kryje 30–50 % příjmu (klient může částečně pracovat,
              cílem je doplnit výpadek).
            </li>
            <li>
              2. stupeň: kryje 50–75 % příjmu (výrazně omezená pracovní schopnost,
              důchod obvykle nepokryje náklady).
            </li>
            <li>
              3. stupeň: cílem je 100 % příjmu (schopnost pracovat téměř mizí,
              důchod kryje jen část).
            </li>
            <li>
              Výpočet: čistý příjem × procento pokrytí × počet měsíců do konce
              krytí (max do 65 let).
            </li>
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}
