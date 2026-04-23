// src/app/pomucky/invalidita/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SplitTitle from "../plan-produkce/SplitTitle";
import { AppLayout } from "@/components/AppLayout";
import { formatMoney } from "@/app/lib/formatters";

const SCENARIOS = [
  { id: "veryLow", label: "Velmi nízké", ratios: [0.1, 0.2, 0.3] },
  { id: "low", label: "Nízké", ratios: [0.3, 0.5, 0.8] },
  { id: "medium", label: "Střední", ratios: [0.4, 0.6, 1.0] },
  { id: "high", label: "Vyšší", ratios: [0.5, 0.75, 1.2] },
] as const;

const DEGREE_LABELS = ["1. stupeň", "2. stupeň", "3. stupeň"];
const INVESTIKA_RETURN_RANGE = { min: 0.055, max: 0.06 };
const INVESTMENT_PRODUCT_NAME = "INVESTIKA Realitní Fond";

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
  const [activeModel, setActiveModel] = useState<"insurance" | "investment">("insurance");
  const [activeScenarioId, setActiveScenarioId] =
    useState<(typeof SCENARIOS)[number]["id"]>("medium");

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
  const activeScenario = useMemo(
    () => results.find((s) => s.id === activeScenarioId) ?? results[0],
    [results, activeScenarioId]
  );

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
          <p className="text-sm text-slate-600 max-w-2xl">
            Stanov pojistnou částku podle poklesu příjmu pro invaliditu 1., 2. a
            3. stupně. Zadáš věk, čistý příjem a délku krytí – uvidíš, kolik
            chybí měsíčně i celkově do 65 let.
          </p>
          <Link
            href="/pomucky"
            className="inline-flex items-center text-xs text-slate-600 hover:text-slate-900 transition"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Vstupní parametry
              </h2>
              <p className="text-xs text-slate-600">
                Věk, čistý příjem a délka krytí (maximálně do 65 let).
              </p>
            </div>
            <div className="text-xs text-slate-600">
              {totalMonths > 0
                ? `Počet měsíců: ${totalMonths.toLocaleString("cs-CZ")} (≈ ${safeCoverageYears} let)`
                : "Nastav věk a délku krytí"}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm text-slate-800">
              <span className="block text-xs uppercase tracking-wide text-slate-600">
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
                className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-500">
                Délka krytí se omezí do 65 let (max {maxCoverage} let).
              </p>
            </label>

            <label className="space-y-1 text-sm text-slate-800">
              <span className="block text-xs uppercase tracking-wide text-slate-600">
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
                className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-500">
                Částka, ze které počítáme pokrytí příjmu.
              </p>
            </label>

            <label className="space-y-1 text-sm text-slate-800">
              <span className="block text-xs uppercase tracking-wide text-slate-600">
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
                className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-500">
                Maximálně do 65 let (zbývá {maxCoverage} let).
              </p>
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Výstup</h2>
              <p className="text-sm text-slate-600">
                {activeModel === "insurance"
                  ? "Návrh pojistné částky pro každý stupeň invalidity v různých úrovních pokrytí příjmu."
                  : `Investiční varianta (${INVESTMENT_PRODUCT_NAME}) pro pokrytí měsíční renty do 65 let (5,5–6 % p.a.).`}
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {activeModel === "insurance"
                ? "Cílem je kompenzovat pokles schopnosti vydělávat."
                : "Pouze ilustrativní výpočet, nejedná se o investiční doporučení."}
            </div>
          </div>

          <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-slate-300 bg-white p-2">
            <button
              type="button"
              onClick={() => setActiveModel("insurance")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeModel === "insurance"
                  ? "border border-slate-900 bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Pojistné plnění
            </button>
            <button
              type="button"
              onClick={() => setActiveModel("investment")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeModel === "investment"
                  ? "border border-slate-900 bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Investiční varianta
            </button>
          </div>
          {activeModel === "investment" && (
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
              Produkt: {INVESTMENT_PRODUCT_NAME}
            </div>
          )}

          {disabled ? (
            <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800">
              Zadej věk, příjem a délku krytí (musí být kladná).
            </div>
          ) : (
            <div className="space-y-3">
              <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-slate-300 bg-white p-2">
                {SCENARIOS.map((scenario) => {
                  const active = scenario.id === activeScenario.id;
                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => setActiveScenarioId(scenario.id)}
                      className={`rounded-full px-4 py-2 text-base font-semibold transition ${
                        active
                          ? "border border-slate-900 bg-slate-900 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {scenario.label}
                    </button>
                  );
                })}
              </div>

              {activeModel === "insurance" ? (
                <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-4 text-white">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-xl font-semibold text-white">{activeScenario.label}</div>
                    <div className="text-xs text-slate-300 text-right">
                      Pokrytí: {activeScenario.ratios.map((r) => `${Math.round(r * 100)}%`).join(" / ")}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {activeScenario.monthly.map((m, idx) => (
                      <div
                        key={`${activeScenario.id}-${idx}`}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="grid gap-2.5 sm:grid-cols-[132px_1.15fr_1fr] sm:items-center">
                          <div className="text-sm uppercase tracking-[0.12em] font-semibold text-slate-500">
                            {DEGREE_LABELS[idx]}
                          </div>
                          <div className="text-sm text-slate-900">
                            <div className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-700 leading-none">
                              {formatMoney(m)} / měsíc
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {Math.round(activeScenario.ratios[idx] * 100)} % příjmu
                            </div>
                          </div>
                          <div className="text-sm text-slate-900 sm:text-right">
                            <div className="text-xs text-slate-500">Celkem do 65 let</div>
                            <div className="mt-0.5 text-lg sm:text-xl font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                              {formatMoney(activeScenario.lump[idx])}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-4 text-white">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xl font-semibold text-white">
                        {activeScenario.label}
                      </div>
                      <div className="text-xs text-slate-300">
                        Cíl: renta z investice ({INVESTMENT_PRODUCT_NAME})
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold leading-none text-slate-900 shadow-[0_2px_10px_rgba(15,23,42,0.2)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      <span>5,5–6 %</span>
                      <span className="text-slate-600">p.a.</span>
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {activeScenario.monthly.map((m, idx) => {
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
                          key={`investika-${activeScenario.id}-${idx}`}
                          className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                        >
                          <div className="grid gap-2.5 sm:grid-cols-[132px_1.15fr_1fr] sm:items-center">
                            <div className="text-sm uppercase tracking-[0.12em] font-semibold text-slate-500">
                              {DEGREE_LABELS[idx]}
                            </div>
                            <div className="text-sm text-slate-900">
                              <div className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-700 leading-none">
                                {formatMoney(m)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                Měsíční renta
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {Math.round(activeScenario.ratios[idx] * 100)} % příjmu
                              </div>
                            </div>
                            <div className="text-sm text-slate-900 sm:text-right">
                              <div className="text-xs text-slate-500">
                                Potřebný vklad
                              </div>
                              <div className="mt-0.5 text-base sm:text-lg font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                                od {formatMoney(minCapital)}
                              </div>
                              <div className="text-base sm:text-lg font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                                do {formatMoney(maxCapital)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900 uppercase tracking-[0.18em]">
              <span>Metodika</span>
              <span className="text-[11px] normal-case tracking-normal text-slate-500 group-open:hidden">
                Zobrazit
              </span>
              <span className="hidden text-[11px] normal-case tracking-normal text-slate-500 group-open:inline">
                Skrýt
              </span>
            </summary>
            <ul className="mt-3 text-sm text-slate-800 space-y-1 list-disc list-inside">
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
          </details>
        </section>
      </div>
    </AppLayout>
  );
}
