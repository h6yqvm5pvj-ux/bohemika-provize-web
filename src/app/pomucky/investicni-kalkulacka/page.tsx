/* eslint-disable react-hooks/set-state-in-effect */
// src/app/pomucky/investicni-kalkulacka/page.tsx
"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";

type Compounding = "monthly" | "annual";

type Result = {
  futureValue: number;
  totalContributed: number;
  interestEarned: number;
};

function parseNumber(text: string): number {
  if (!text) return 0;
  const value = parseFloat(text.replace(",", "."));
  return Number.isNaN(value) ? 0 : value;
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "0 CZK";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }) + " CZK"
  );
}

// jednoduchý count-up efekt
function useAnimatedNumber(target: number, duration = 700) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0);
      return;
    }

    let frame: number;
    const start = performance.now();
    const from = 0;
    const diff = target - from;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(from + diff * progress);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    setValue(0);
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export default function InvestmentCalculatorPage() {
  const [initialText, setInitialText] = useState("100000");
  const [monthlyText, setMonthlyText] = useState("2000");
  const [rateText, setRateText] = useState("7");
  const [yearsText, setYearsText] = useState("10");
  const [compounding, setCompounding] = useState<Compounding>("annual");

  const [result, setResult] = useState<Result | null>(null);

  const animatedFuture = useAnimatedNumber(result?.futureValue ?? 0);
  const animatedContrib = useAnimatedNumber(result?.totalContributed ?? 0);
  const animatedInterest = useAnimatedNumber(result?.interestEarned ?? 0);

  const handleCalculate = () => {
    const initial = parseNumber(initialText);
    const monthly = parseNumber(monthlyText);
    const ratePct = parseNumber(rateText);
    const years = parseNumber(yearsText);

    if (ratePct <= 0 || years <= 0) {
      setResult({
        futureValue: initial + monthly * 12 * years,
        totalContributed: initial + monthly * 12 * years,
        interestEarned: 0,
      });
      return;
    }

    const r = ratePct / 100;

    let futureValue = 0;
    const months = years * 12;
    const totalContributed = initial + monthly * months;

    if (compounding === "monthly") {
      // měsíční úročení, měsíční vklady
      const i = r / 12;
      const fvLump = initial * Math.pow(1 + i, months);
      const fvAnnuity =
        monthly * ((Math.pow(1 + i, months) - 1) / i);
      futureValue = fvLump + fvAnnuity;
    } else {
      // roční úročení – orientačně: měsíční vklady agregujeme do ročních
      const yearlyContribution = monthly * 12;
      const n = years;
      const i = r;
      const fvLump = initial * Math.pow(1 + i, n);
      const fvAnnuity =
        yearlyContribution * ((Math.pow(1 + i, n) - 1) / i);
      futureValue = fvLump + fvAnnuity;
    }

    const interestEarned = futureValue - totalContributed;

    setResult({
      futureValue,
      totalContributed,
      interestEarned,
    });
  };

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Úroková / investiční kalkulačka
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              Výpočet předpokládá pravidelné měsíční vklady a složené
              úročení podle zvolené periody.
            </p>
          </div>
        </header>

        {/* Vstupy */}
        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-6 sm:px-8 sm:py-7 shadow-[0_24px_90px_rgba(0,0,0,0.85)] space-y-5">
          <h2 className="text-sm font-semibold text-slate-100 mb-1">
            Vstupní údaje
          </h2>

          <div className="space-y-4">
            {/* Počáteční vklad */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-100">
                Počáteční vklad
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="w-full rounded-2xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={initialText}
                onChange={(e) => setInitialText(e.target.value)}
                placeholder="Např. 100000"
              />
            </div>

            {/* Měsíční vklad */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-100">
                Měsíční vklad
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="w-full rounded-2xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={monthlyText}
                onChange={(e) => setMonthlyText(e.target.value)}
                placeholder="Např. 2000"
              />
            </div>

            {/* Roční úroková sazba */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-100">
                Roční úroková sazba (%)
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="w-full rounded-2xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
                placeholder="Např. 7"
              />
            </div>

            {/* Doba trvání */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-100">
                Doba trvání (roky)
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="w-full rounded-2xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={yearsText}
                onChange={(e) => setYearsText(e.target.value)}
                placeholder="Např. 10"
              />
            </div>

            {/* Periody úročení */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-100">
                Periody úročení
              </p>
              <div className="inline-flex rounded-full bg-slate-950/70 border border-white/15 p-1 text-xs shadow-inner shadow-black/60">
                <button
                  type="button"
                  onClick={() => setCompounding("annual")}
                  className={`px-4 py-1.5 rounded-full transition ${
                    compounding === "annual"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-200"
                  }`}
                >
                  Ročně
                </button>
                <button
                  type="button"
                  onClick={() => setCompounding("monthly")}
                  className={`px-4 py-1.5 rounded-full transition ${
                    compounding === "monthly"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-200"
                  }`}
                >
                  Měsíčně
                </button>
              </div>
            </div>
          </div>

          {/* Tlačítko spočítat */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleCalculate}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/40 hover:brightness-110"
            >
              <span>f(x)</span>
              <span>Spočítat</span>
            </button>
          </div>
        </section>

        {/* Výsledky */}
        {result && (
          <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-6 sm:px-8 sm:py-7 shadow-[0_24px_90px_rgba(0,0,0,0.85)] space-y-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Výsledek
            </h2>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Konečná hodnota
              </p>
              <p className="text-2xl sm:text-3xl font-semibold text-white">
                {formatMoney(animatedFuture)}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Celkem vloženo
              </p>
              <p className="text-lg font-semibold text-slate-50">
                {formatMoney(animatedContrib)}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Z toho úroky
              </p>
              <p className="text-lg font-semibold text-emerald-300">
                {formatMoney(animatedInterest)}
              </p>
            </div>

            <p className="text-[11px] text-slate-400 pt-2">
              Výpočet předpokládá pravidelné měsíční vklady a složené úročení
              podle zvolené periody. Jedná se o orientační výpočet – skutečný
              výnos může být odlišný.
            </p>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
