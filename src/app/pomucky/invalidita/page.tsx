// src/app/pomucky/invalidita/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
const DEGREE_CARD_HEIGHT_CLASSES = [
  "md:min-h-[280px]",
  "md:min-h-[320px]",
  "md:min-h-[360px]",
] as const;
const DEGREE_CARD_STYLES = [
  {
    stripClass: "bg-[linear-gradient(90deg,#0b1220_0%,#173a71_55%,#2c61af_100%)]",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
    accentClass: "text-blue-700",
  },
  {
    stripClass: "bg-[linear-gradient(90deg,#0b1220_0%,#1c467f_55%,#3a78c2_100%)]",
    badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-800",
    accentClass: "text-indigo-700",
  },
  {
    stripClass: "bg-[linear-gradient(90deg,#0b1220_0%,#234f87_55%,#4c86c8_100%)]",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-800",
    accentClass: "text-sky-700",
  },
] as const;
const INPUT_FIELD_STYLES = [
  {
    stripClass: "bg-[linear-gradient(90deg,#0b1220_0%,#173a71_55%,#2c61af_100%)]",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
    focusClass: "focus-within:border-blue-300 focus-within:shadow-[0_10px_24px_rgba(37,99,235,0.14)]",
  },
  {
    stripClass: "bg-[linear-gradient(90deg,#0b1220_0%,#1c467f_55%,#3a78c2_100%)]",
    badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-800",
    focusClass: "focus-within:border-indigo-300 focus-within:shadow-[0_10px_24px_rgba(79,70,229,0.14)]",
  },
  {
    stripClass: "bg-[linear-gradient(90deg,#0b1220_0%,#234f87_55%,#4c86c8_100%)]",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-800",
    focusClass: "focus-within:border-sky-300 focus-within:shadow-[0_10px_24px_rgba(14,165,233,0.14)]",
  },
] as const;
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
        </header>

        <section className="section-reveal space-y-4 px-5 py-1 [animation-delay:40ms]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Nastavení výpočtu
                </div>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  Vstupní parametry
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Věk, čistý příjem a délka krytí maximálně do 65 let.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
                  Zbývá do 65: {maxCoverage} let
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
                  {totalMonths > 0
                    ? `${totalMonths.toLocaleString("cs-CZ")} měsíců`
                    : "Nastav parametry"}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.15fr_1fr]">
              <label
                className={[
                  "group overflow-hidden rounded-2xl border border-slate-200 bg-white transition",
                  INPUT_FIELD_STYLES[0].focusClass,
                ].join(" ")}
              >
                <div className={`h-1 ${INPUT_FIELD_STYLES[0].stripClass}`} />
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Věk klienta
                    </span>
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        INPUT_FIELD_STYLES[0].badgeClass,
                      ].join(" ")}
                    >
                      zbývá {maxCoverage} let
                    </span>
                  </div>
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
                    className="mt-3 w-full border-0 border-b border-slate-200 bg-transparent px-0 pb-2 text-2xl font-semibold leading-none text-slate-950 outline-none transition focus:border-blue-300 focus:ring-0"
                  />
                  <p className="mt-2 text-[11px] leading-snug text-slate-500">
                    Délka krytí se automaticky omezí do 65 let.
                  </p>
                </div>
              </label>

              <label
                className={[
                  "group overflow-hidden rounded-2xl border border-slate-200 bg-white transition",
                  INPUT_FIELD_STYLES[1].focusClass,
                ].join(" ")}
              >
                <div className={`h-1 ${INPUT_FIELD_STYLES[1].stripClass}`} />
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Čistý měsíční příjem
                    </span>
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        INPUT_FIELD_STYLES[1].badgeClass,
                      ].join(" ")}
                    >
                      základ
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={netIncome}
                    onChange={(e) => {
                      const v = handleNumber(e.target.value, netIncome);
                      setNetIncome(Math.max(0, Math.round(v)));
                    }}
                    className="mt-3 w-full border-0 border-b border-slate-200 bg-transparent px-0 pb-2 text-2xl font-semibold leading-none text-slate-950 outline-none transition focus:border-indigo-300 focus:ring-0"
                  />
                  <p className="mt-2 text-[11px] leading-snug text-slate-500">
                    Částka, ze které počítáme pokrytí příjmu.
                  </p>
                </div>
              </label>

              <label
                className={[
                  "group overflow-hidden rounded-2xl border border-slate-200 bg-white transition",
                  INPUT_FIELD_STYLES[2].focusClass,
                ].join(" ")}
              >
                <div className={`h-1 ${INPUT_FIELD_STYLES[2].stripClass}`} />
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Délka krytí v letech
                    </span>
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        INPUT_FIELD_STYLES[2].badgeClass,
                      ].join(" ")}
                    >
                      do 65
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={maxCoverage}
                    value={safeCoverageYears}
                    onChange={(e) => {
                      const v = handleNumber(e.target.value, safeCoverageYears);
                      setCoverageYears(Math.max(0, Math.min(maxCoverage, Math.round(v))));
                    }}
                    className="mt-3 w-full border-0 border-b border-slate-200 bg-transparent px-0 pb-2 text-2xl font-semibold leading-none text-slate-950 outline-none transition focus:border-sky-300 focus:ring-0"
                  />
                  <p className="mt-2 text-[11px] leading-snug text-slate-500">
                    Maximálně do 65 let, aktuálně zbývá {maxCoverage} let.
                  </p>
                </div>
              </label>
          </div>
        </section>

        <section className="section-reveal space-y-4 [animation-delay:120ms]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Výstup</h2>
            </div>
            <div className="text-xs text-slate-500">
              {activeModel === "insurance"
                ? "Cílem je kompenzovat pokles schopnosti vydělávat."
                : "Pouze ilustrativní výpočet, nejedná se o investiční doporučení."}
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="inline-flex min-w-max items-center gap-2 rounded-2xl border border-slate-300 bg-white/95 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              <div className="inline-flex items-center rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveModel("insurance")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    activeModel === "insurance"
                      ? "animate-tab-pop bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_6px_16px_rgba(5,150,105,0.38)]"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  Pojistné plnění
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModel("investment")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    activeModel === "investment"
                      ? "animate-tab-pop bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_6px_16px_rgba(5,150,105,0.38)]"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  Investiční varianta
                </button>
              </div>

              <span className="h-8 w-px bg-slate-200" aria-hidden="true" />

              <div className="inline-flex items-center rounded-xl bg-slate-100/80 p-1 ring-1 ring-slate-200">
                {SCENARIOS.map((scenario) => {
                  const active = scenario.id === activeScenario.id;
                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => setActiveScenarioId(scenario.id)}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        active
                          ? "animate-tab-pop bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_6px_16px_rgba(5,150,105,0.38)]"
                          : "border border-transparent text-slate-600 hover:bg-white hover:text-slate-900"
                      }`}
                    >
                      {scenario.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {activeModel === "investment" && (
            <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
              Produkt: {INVESTMENT_PRODUCT_NAME}
            </div>
          )}

          {disabled ? (
            <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800">
              Zadej věk, příjem a délku krytí (musí být kladná).
            </div>
          ) : (
            <div className="space-y-3">
              {activeModel === "insurance" ? (
                <div className="mx-auto w-full max-w-5xl">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-2xl font-semibold text-slate-900">
                          {activeScenario.label}
                        </div>
                        <div className="text-xs text-slate-600">
                          Varianta krytí invalidity
                        </div>
                      </div>
                      <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        Pokrytí:{" "}
                        {activeScenario.ratios
                          .map((r) => `${Math.round(r * 100)}%`)
                          .join(" / ")}
                      </div>
                    </div>

                    <div className="mx-auto grid w-full max-w-5xl items-end gap-4 md:grid-cols-3">
                      {activeScenario.monthly.map((m, idx) => {
                        const style = DEGREE_CARD_STYLES[idx];
                        return (
                          <article
                            key={`${activeScenario.id}-${idx}`}
                            className={[
                              "result-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)]",
                              idx === 0
                                ? "[animation-delay:0ms]"
                                : idx === 1
                                  ? "[animation-delay:80ms]"
                                  : "[animation-delay:160ms]",
                              DEGREE_CARD_HEIGHT_CLASSES[idx],
                            ].join(" ")}
                          >
                            <div className={`h-1.5 ${style.stripClass}`} />

                            <div className="px-4 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Stupeň invalidity
                                  </div>
                                  <h3 className="mt-1 text-lg font-semibold leading-tight text-slate-950">
                                    {DEGREE_LABELS[idx]}
                                  </h3>
                                </div>
                                <div
                                  className={[
                                    "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                    style.badgeClass,
                                  ].join(" ")}
                                >
                                  {Math.round(activeScenario.ratios[idx] * 100)} %
                                </div>
                              </div>

                              <div className="mt-4 divide-y divide-slate-200 border-y border-slate-100">
                                <div className="flex items-start justify-between gap-4 py-3">
                                  <div className="min-w-0 text-sm text-slate-700">
                                    <div className="font-semibold text-slate-950">
                                      Měsíční renta
                                    </div>
                                    <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                                      Doplnění příjmu podle zvolené varianty
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right text-sm text-slate-950">
                                    <div className={`text-xl font-semibold tabular-nums ${style.accentClass}`}>
                                      {formatMoney(m)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-start justify-between gap-4 py-3">
                                  <div className="min-w-0 text-sm text-slate-700">
                                    <div className="font-semibold text-slate-950">
                                      Celkem do 65 let
                                    </div>
                                    <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                                      Měsíční renta × počet měsíců krytí
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right text-sm text-slate-950">
                                    <div className={`font-semibold tabular-nums ${style.accentClass}`}>
                                      {formatMoney(activeScenario.lump[idx])}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-5xl">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-2xl font-semibold text-slate-900">
                          {activeScenario.label}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          Cíl: renta z investice ({INVESTMENT_PRODUCT_NAME})
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold leading-none text-slate-900 shadow-[0_2px_10px_rgba(15,23,42,0.2)]">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-blue-600"
                          aria-hidden="true"
                        />
                        <span>5,5–6 %</span>
                        <span className="text-slate-600">p.a.</span>
                      </span>
                    </div>

                    <div className="mx-auto grid w-full max-w-5xl items-end gap-4 md:grid-cols-3">
                      {activeScenario.monthly.map((m, idx) => {
                        const style = DEGREE_CARD_STYLES[idx];
                        const coveragePct =
                          netIncome > 0 ? Math.round((m / netIncome) * 100) : 0;
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
                          <article
                            key={`investika-${activeScenario.id}-${idx}`}
                            className={[
                              "result-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)]",
                              idx === 0
                                ? "[animation-delay:0ms]"
                                : idx === 1
                                  ? "[animation-delay:80ms]"
                                  : "[animation-delay:160ms]",
                              DEGREE_CARD_HEIGHT_CLASSES[idx],
                            ].join(" ")}
                          >
                            <div className={`h-1.5 ${style.stripClass}`} />

                            <div className="px-4 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Stupeň invalidity
                                  </div>
                                  <h3 className="mt-1 text-lg font-semibold leading-tight text-slate-950">
                                    {DEGREE_LABELS[idx]}
                                  </h3>
                                </div>
                                <div
                                  className={[
                                    "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                                    style.badgeClass,
                                  ].join(" ")}
                                >
                                  Pokrytí {coveragePct} %
                                </div>
                              </div>

                              <div className="mt-4 divide-y divide-slate-200 border-y border-slate-100">
                                <div className="flex items-start justify-between gap-4 py-3">
                                  <div className="min-w-0 text-sm text-slate-700">
                                    <div className="font-semibold text-slate-950">
                                      Měsíční renta
                                    </div>
                                    <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                                      Cílový výběr z investice
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right text-sm text-slate-950">
                                    <div className={`text-xl font-semibold tabular-nums ${style.accentClass}`}>
                                      {formatMoney(m)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-start justify-between gap-4 py-3">
                                  <div className="min-w-0 text-sm text-slate-700">
                                    <div className="font-semibold text-slate-950">
                                      Potřebný vklad
                                    </div>
                                    <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                                      Při modelovaném výnosu 5,5-6 % p.a.
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right text-sm text-slate-950">
                                    <div className={`font-semibold tabular-nums ${style.accentClass}`}>
                                      od {formatMoney(minCapital)}
                                    </div>
                                    <div className={`font-semibold tabular-nums ${style.accentClass}`}>
                                      do {formatMoney(maxCapital)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
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
        <style jsx>{`
          .section-reveal {
            animation: section-reveal 560ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          }
          .result-card {
            animation: card-rise 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          }
          .animate-tab-pop {
            animation: tab-pop 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          }
          @keyframes section-reveal {
            from {
              opacity: 0;
              transform: translateY(14px);
              filter: blur(4px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
              filter: blur(0);
            }
          }
          @keyframes card-rise {
            from {
              opacity: 0;
              transform: translateY(22px) scale(0.985);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes tab-pop {
            0% {
              transform: scale(0.97);
            }
            60% {
              transform: scale(1.03);
            }
            100% {
              transform: scale(1);
            }
          }
          :global(html[data-motion="off"]) .section-reveal,
          :global(html[data-motion="off"]) .result-card,
          :global(html[data-motion="off"]) .animate-tab-pop {
            animation: none !important;
          }
          @media (prefers-reduced-motion: reduce) {
            .section-reveal,
            .result-card,
            .animate-tab-pop {
              animation: none !important;
            }
          }
        `}</style>
      </div>
    </AppLayout>
  );
}
