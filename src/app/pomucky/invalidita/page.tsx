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

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {results.map((scenario) => (
                <div
                  key={scenario.id}
                  className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 via-slate-900/50 to-slate-950/60 px-4 py-4 shadow-[0_14px_44px_rgba(0,0,0,0.7)] backdrop-blur"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">
                      {scenario.label}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Pokrytí: {scenario.ratios.map((r) => `${Math.round(r * 100)}%`).join(" / ")}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {scenario.monthly.map((m, idx) => (
                      <div
                        key={`${scenario.id}-${idx}`}
                        className="flex items-start justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                      >
                        <div className="text-sm text-slate-200">
                          <div className="font-semibold text-white">
                            {DEGREE_LABELS[idx]}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {Math.round(scenario.ratios[idx] * 100)} % příjmu
                          </div>
                        </div>
                        <div className="text-right text-sm text-white leading-tight">
                          <div className="font-semibold whitespace-nowrap">
                            {formatMoney(m)} / měsíc
                          </div>
                          <div className="text-[11px] font-semibold text-emerald-200/90 whitespace-nowrap">
                            celkem {formatMoney(scenario.lump[idx])}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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
