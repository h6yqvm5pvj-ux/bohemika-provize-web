"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import SplitTitle from "../plan-produkce/SplitTitle";
import { AppLayout } from "@/components/AppLayout";
import { formatMoney } from "@/app/lib/formatters";

const PERIODS = [
  {
    id: "p30",
    label: "1.–30. den",
    rate: 0.6,
    note: "60 % redukovaného DVZ",
    stripClass: "bg-[linear-gradient(90deg,#10b981_0%,#86efac_100%)]",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    accentClass: "text-emerald-700",
  },
  {
    id: "p60",
    label: "31.–60. den",
    rate: 0.66,
    note: "66 % redukovaného DVZ",
    stripClass: "bg-[linear-gradient(90deg,#0ea5e9_0%,#7dd3fc_100%)]",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    accentClass: "text-sky-700",
  },
  {
    id: "p90",
    label: "61. den a dál",
    rate: 0.72,
    note: "72 % redukovaného DVZ",
    stripClass: "bg-[linear-gradient(90deg,#c89d2e_0%,#f6d36b_100%)]",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    accentClass: "text-amber-700",
  },
] as const;

const DAILY_TARGET_RATIO = 0.4; // min. 40 % poklesu příjmu pokrývá komerční pojištění

export default function PracovniNeschopenkaPage() {
  const [netIncome, setNetIncome] = useState(30000);
  const [calculationOpen, setCalculationOpen] = useState(false);

  const recommendedDaily = Math.max(
    0,
    Math.round((netIncome * DAILY_TARGET_RATIO) / 30)
  );
  const recommendedMonthly = recommendedDaily * 30;

  const results = useMemo(() => {
    return PERIODS.map((p) => {
      const stateBenefit = Math.round(netIncome * p.rate);
      const shortfall = Math.max(0, netIncome - stateBenefit);
      return {
        ...p,
        stateBenefit,
        shortfall,
        coverage: Math.max(shortfall, recommendedMonthly),
      };
    });
  }, [netIncome, recommendedMonthly]);

  const handleNumber = (val: string, fallback: number) => {
    const num = Number(val.replace(",", "."));
    return Number.isFinite(num) ? num : fallback;
  };

  const disabled = netIncome <= 0;

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6">
        <header className="mb-2 space-y-2">
          <SplitTitle text="Kalkulačka neschopenka" />
        </header>

        <section className="space-y-4 px-5 py-1">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Nastavení výpočtu
                </div>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  Vstupní parametry
                </h2>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
              <label className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition focus-within:border-emerald-300 focus-within:shadow-[0_10px_24px_rgba(16,185,129,0.12)]">
                <div className="h-1 bg-[linear-gradient(90deg,#10b981_0%,#86efac_100%)]" />
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Čistý měsíční příjem
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      vstup
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
                    className="mt-3 w-full border-0 border-b border-slate-200 bg-transparent px-0 pb-2 text-2xl font-semibold leading-none text-slate-950 outline-none transition focus:border-emerald-300 focus:ring-0"
                  />
                  <p className="mt-2 text-[11px] leading-snug text-slate-500">
                    Výchozí částka pro dopočet doporučeného krytí.
                  </p>
                </div>
              </label>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <div className="h-1 bg-[linear-gradient(90deg,#0ea5e9_0%,#7dd3fc_100%)]" />
                <div className="flex min-h-[132px] flex-col justify-between px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Doporučená denní dávka
                    </div>
                    <div className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      den
                    </div>
                  </div>
                  <div className="text-right text-4xl font-semibold leading-none text-sky-700">
                    {formatMoney(recommendedDaily)}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <div className="h-1 bg-[linear-gradient(90deg,#c89d2e_0%,#f6d36b_100%)]" />
                <div className="flex min-h-[132px] flex-col justify-between px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Měsíční krytí
                    </div>
                    <div className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      30 dní
                    </div>
                  </div>
                  <div className="text-right text-4xl font-semibold leading-none text-amber-700">
                    {formatMoney(recommendedMonthly)}
                  </div>
                </div>
              </div>
          </div>
        </section>

        <section className="px-5 pt-1 pb-5">
          {disabled ? (
            <div className="rounded-2xl border border-slate-900 bg-white px-4 py-3 text-sm text-slate-800">
              Doplň příjem pro výpočet krytí.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {results.map((period) => (
                <article
                  key={period.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
                >
                  <div className={`h-1.5 ${period.stripClass}`} />

                  <div className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Období
                        </div>
                        <h3 className="mt-1 text-lg font-semibold leading-tight text-slate-950">
                          {period.label}
                        </h3>
                      </div>
                      <div
                        className={[
                          "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                          period.badgeClass,
                        ].join(" ")}
                      >
                        {period.note}
                      </div>
                    </div>

                    <div className="mt-4 divide-y divide-slate-200 border-y border-slate-100">
                      <div className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0 text-sm text-slate-700">
                          <div className="font-semibold text-slate-950">
                            Státní nemocenská
                          </div>
                          <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                            Orientačně čistý příjem × sazba období
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-sm text-slate-950">
                          <div className="font-semibold">
                            {formatMoney(period.stateBenefit)}
                          </div>
                          <div className={`text-[11px] ${period.accentClass}`}>
                            {Math.round(period.rate * 100)} % příjmu
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0 text-sm text-slate-700">
                          <div className="font-semibold text-slate-950">Pokles příjmu</div>
                          <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                            Co chybí oproti čistému příjmu
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-sm text-slate-950">
                          <div className="font-semibold">
                            {formatMoney(period.shortfall)}
                          </div>
                          <div className={`text-[11px] ${period.accentClass}`}>
                            {Math.round((period.shortfall / netIncome) * 100)} %
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0 text-sm text-slate-700">
                          <div className="font-semibold text-slate-950">
                            Komerční dávka
                          </div>
                          <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                            Min. 40 % příjmu (denní dávka × 30 dní)
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-sm text-slate-950">
                          <div className="font-semibold">
                            {formatMoney(period.coverage)}
                          </div>
                          <div className={`text-[11px] ${period.accentClass}`}>
                            {formatMoney(recommendedDaily)} / den
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-500">
                      Krytí drží doporučenou měsíční částku i v pozdějších obdobích,
                      kde státní dávka vychází vyšší.
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-900 bg-rose-300 px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-black uppercase tracking-[0.16em]">
                Upozornění na krácení (–50 %) nemocenské dávky vyplácené státem.
              </h3>
              <p className="text-sm text-black">
                Rvačka, opilost, zneužití látek nebo úmyslný přestupek/trestný čin
                snižují dávku o polovinu.
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-900 bg-white">
          <button
            type="button"
            onClick={() => setCalculationOpen((open) => !open)}
            aria-expanded={calculationOpen}
            aria-controls="sickness-calculation-details"
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
          >
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
              Výpočet a výše dávky
            </h3>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-slate-700 transition-transform ${calculationOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {calculationOpen ? (
            <div id="sickness-calculation-details" className="border-t border-slate-200 px-5 py-5">
              <ul className="space-y-1 text-sm text-slate-800 list-disc list-inside">
                <li>
                  Denní vyměřovací základ: průměrný denní příjem za 12 měsíců, očištěný
                  o vyloučené dny. Následně se redukuje třemi redukčními hranicemi.
                </li>
                <li>
                  Výše nemocenského (příklad 30 000 Kč): 60 % první 30 dní (18 000 Kč),
                  66 % 31.–60. den (19 800 Kč), 72 % od 61. dne (21 600 Kč).
                </li>
                <li>
                  Pokles příjmu (příklad 30 000 Kč): 12 000 Kč / 10 200 Kč / 8 400 Kč
                  pro jednotlivá období.
                </li>
                <li>
                  Doporučená denní dávka komerčního pojištění: min. 40 % příjmu / 30 dní
                  (např. 30 000 Kč → 400 Kč/den, 35 000 Kč → 460 Kč/den, 40 000 Kč →
                  540 Kč/den).
                </li>
                <li>
                  Nemocenská dávka se snižuje o 50 %, pokud klient způsobil PN rvačkou, opilostí,
                  zneužitím návykových látek či úmyslným trestným činem/přestupkem.
                </li>
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </AppLayout>
  );
}
