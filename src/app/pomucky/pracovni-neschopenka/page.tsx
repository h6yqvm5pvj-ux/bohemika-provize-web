"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SplitTitle from "../plan-produkce/SplitTitle";
import { AppLayout } from "@/components/AppLayout";

const PERIODS = [
  { id: "p30", label: "1.–30. den", rate: 0.6, note: "60 % redukovaného DVZ" },
  { id: "p60", label: "31.–60. den", rate: 0.66, note: "66 % redukovaného DVZ" },
  { id: "p90", label: "61. den a dál", rate: 0.72, note: "72 % redukovaného DVZ" },
] as const;

const DAILY_TARGET_RATIO = 0.4; // min. 40 % poklesu příjmu pokrývá komerční pojištění

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

export default function PracovniNeschopenkaPage() {
  const [netIncome, setNetIncome] = useState(30000);

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
          <Link
            href="/pomucky"
            className="inline-flex items-center text-xs text-slate-600 hover:text-slate-900 transition"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <section className="rounded-3xl border border-slate-900 bg-white px-6 py-6 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-900">Vstupní parametry</h2>
              <p className="text-xs text-slate-600">
                Zadej čistý měsíční příjem. Ostatní hodnoty se počítají automaticky.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-900">
              Vzorec: příjem × 0,40 / 30
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
            <label className="space-y-3 rounded-2xl border border-slate-900 bg-white px-4 py-4 text-sm text-slate-800">
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
                className="w-full rounded-xl border border-slate-900 bg-white px-3 py-2.5 text-lg font-semibold text-slate-900 outline-none focus:ring-0"
              />
              <p className="text-[11px] text-slate-500">
                Vstup pro výpočet redukovaného DVZ a cílové dávky.
              </p>
            </label>

            <div className="flex min-h-[142px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-900 bg-emerald-300 px-4 py-4 text-center text-slate-900">
              <div className="text-xs uppercase tracking-wide font-semibold">
                Doporučená denní dávka
              </div>
              <div className="text-4xl font-semibold leading-none">{formatMoney(recommendedDaily)}</div>
            </div>

            <div className="flex min-h-[142px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-900 bg-white px-4 py-4 text-center text-slate-900">
              <div className="text-xs uppercase tracking-wide text-slate-600 font-semibold">
                Měsíční krytí
              </div>
              <div className="text-4xl font-semibold leading-none">{formatMoney(recommendedMonthly)}</div>
            </div>
          </div>
        </section>

        <section
          className="rounded-3xl border border-slate-900 bg-white px-5 py-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Výstup</h2>
              <p className="text-xs text-slate-600">
                Porovnání státní nemocenské a připojištění PN dávky pro tři období PN.
              </p>
            </div>
            <div className="text-[11px] text-slate-500">
              Cíl: pokrýt min. 40 % poklesu příjmu (orientačně plné dorovnání
              1.–30. den).
            </div>
          </div>

          {disabled ? (
            <div className="rounded-2xl border border-slate-900 bg-white px-4 py-3 text-sm text-slate-800">
              Zadej čistý měsíční příjem.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {results.map((period) => (
                <div
                  key={period.id}
                  className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-4 text-white"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">
                      {period.label}
                    </div>
                    <div className="text-[11px] text-slate-300">{period.note}</div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start justify-between rounded-xl border border-slate-900 bg-white px-3 py-2.5">
                      <div className="text-sm text-slate-800">
                        <div className="font-semibold text-slate-900">
                          Státní nemocenská (měsíčně)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Orientačně čistý příjem × sazba období
                        </div>
                      </div>
                      <div className="text-right text-sm text-slate-900">
                        <div className="font-semibold">
                          {formatMoney(period.stateBenefit)}
                        </div>
                        <div className="text-[11px] text-emerald-800/80">
                          {Math.round(period.rate * 100)} % čistého příjmu
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between rounded-xl border border-slate-900 bg-white px-3 py-2.5">
                      <div className="text-sm text-slate-800">
                        <div className="font-semibold text-slate-900">Pokles příjmu</div>
                        <div className="text-[11px] text-slate-500">
                          Co chybí oproti čistému příjmu
                        </div>
                      </div>
                      <div className="text-right text-sm text-slate-900">
                        <div className="font-semibold">
                          {formatMoney(period.shortfall)}
                        </div>
                        <div className="text-[11px] text-emerald-800/80">
                          {Math.round((period.shortfall / netIncome) * 100)} %
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between rounded-xl border border-slate-900 bg-white px-3 py-2.5">
                      <div className="text-sm text-slate-800">
                        <div className="font-semibold text-slate-900">
                          Doporučená komerční dávka
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Min. 40 % příjmu (denní dávka × 30 dní)
                        </div>
                      </div>
                      <div className="text-right text-sm text-slate-900">
                        <div className="font-semibold">
                          {formatMoney(period.coverage)}
                        </div>
                        <div className="text-[11px] text-emerald-800/80">
                          {formatMoney(recommendedDaily)} / den
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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

        <section
          className="rounded-3xl border border-slate-900 bg-white px-5 py-5 space-y-3"
        >
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-[0.18em]">
            Výpočet a výše dávky
          </h3>
          <ul className="text-sm text-slate-800 space-y-1 list-disc list-inside">
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
        </section>
      </div>
    </AppLayout>
  );
}
