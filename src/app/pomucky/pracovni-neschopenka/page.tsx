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
          <p className="text-sm text-slate-300 max-w-2xl">
            Kalkulačka na stanovení pojistné částky pro případ pracovní
            neschopnosti. Výpočet vychází z redukovaného denního vyměřovacího
            základu a doporučení pokrýt alespoň 40 % poklesu příjmu.
          </p>
          <Link
            href="/pomucky"
            className="inline-flex items-center text-xs text-slate-300 hover:text-white transition"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <section
          className="rounded-3xl border border-white/10 bg-white/0 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.7)] space-y-5"
          style={{ backgroundColor: "rgba(255,255,255,0.025)" }}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-white">Vstupní parametry</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm text-slate-200 sm:col-span-1">
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
                Vstup pro výpočet redukovaného DVZ a cílové dávky.
              </p>
            </label>

            <div className="space-y-1 rounded-2xl border border-emerald-100/30 bg-gradient-to-br from-emerald-900/25 via-emerald-800/22 to-slate-950/25 px-4 py-3 text-sm text-white sm:col-span-1">
              <div className="text-xs uppercase tracking-wide text-slate-300">
                Doporučená denní dávka
              </div>
              <div className="text-2xl font-semibold">
                {formatMoney(recommendedDaily)}
              </div>
              <p className="text-[11px] text-slate-400">
                Min. 40 % čistého příjmu / 30 dní.
              </p>
            </div>

            <div className="space-y-1 rounded-2xl border border-emerald-100/30 bg-gradient-to-br from-emerald-900/25 via-emerald-800/22 to-slate-950/25 px-4 py-3 text-sm text-white sm:col-span-1">
              <div className="text-xs uppercase tracking-wide text-slate-300">
                Měsíční krytí
              </div>
              <div className="text-2xl font-semibold">
                {formatMoney(recommendedMonthly)}
              </div>
              <p className="text-[11px] text-slate-400">
                Hodnota při doporučené denní dávce (× 30 dní).
              </p>
            </div>
          </div>
        </section>

        <section
          className="rounded-3xl border border-white/10 bg-white/0 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.7)] space-y-4"
          style={{ backgroundColor: "rgba(255,255,255,0.025)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Výstup</h2>
              <p className="text-xs text-slate-300">
                Porovnání státní nemocenské a připojištění PN dávky pro tři období PN.
              </p>
            </div>
            <div className="text-[11px] text-slate-400">
              Cíl: pokrýt min. 40 % poklesu příjmu (orientačně plné dorovnání
              1.–30. den).
            </div>
          </div>

          {disabled ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              Zadej čistý měsíční příjem.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {results.map((period) => (
                <div
                  key={period.id}
                  className="rounded-2xl border border-white/6 bg-gradient-to-br from-white/3 via-slate-900/24 to-slate-950/28 px-4 py-4 shadow-[0_14px_44px_rgba(0,0,0,0.65)] backdrop-blur"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">
                      {period.label}
                    </div>
                    <div className="text-[11px] text-slate-400">{period.note}</div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start justify-between rounded-xl border border-white/6 bg-white/2 px-3 py-2.5">
                      <div className="text-sm text-slate-200">
                        <div className="font-semibold text-white">
                          Státní nemocenská (měsíčně)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Orientačně čistý příjem × sazba období
                        </div>
                      </div>
                      <div className="text-right text-sm text-white">
                        <div className="font-semibold">
                          {formatMoney(period.stateBenefit)}
                        </div>
                        <div className="text-[11px] text-emerald-200/80">
                          {Math.round(period.rate * 100)} % čistého příjmu
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between rounded-xl border border-white/6 bg-white/2 px-3 py-2.5">
                      <div className="text-sm text-slate-200">
                        <div className="font-semibold text-white">Pokles příjmu</div>
                        <div className="text-[11px] text-slate-400">
                          Co chybí oproti čistému příjmu
                        </div>
                      </div>
                      <div className="text-right text-sm text-white">
                        <div className="font-semibold">
                          {formatMoney(period.shortfall)}
                        </div>
                        <div className="text-[11px] text-emerald-200/80">
                          {Math.round((period.shortfall / netIncome) * 100)} %
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between rounded-xl border border-sky-400/20 bg-sky-400/6 px-3 py-2.5">
                      <div className="text-sm text-slate-200">
                        <div className="font-semibold text-white">
                          Doporučená komerční dávka
                        </div>
                        <div className="text-[11px] text-slate-300">
                          Min. 40 % příjmu (denní dávka × 30 dní)
                        </div>
                      </div>
                      <div className="text-right text-sm text-white">
                        <div className="font-semibold">
                          {formatMoney(period.coverage)}
                        </div>
                        <div className="text-[11px] text-emerald-200/80">
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

        <section
          className="relative overflow-hidden rounded-3xl border border-amber-300/60 bg-gradient-to-r from-[#1a0f08] via-[#2b1a10] to-[#120c1d] px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.75)]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(255,196,122,0.1), transparent 45%), radial-gradient(circle at 80% 40%, rgba(124,58,237,0.12), transparent 40%), linear-gradient(90deg, rgba(255,158,62,0.08), rgba(105,48,195,0.08))",
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-amber-100 uppercase tracking-[0.16em]">
                Upozornění na krácení (–50 %) nemocenské dávky vyplácené státem.
              </h3>
              <p className="text-sm text-amber-50/90">
                Rvačka, opilost, zneužití látek nebo úmyslný přestupek/trestný čin
                snižují dávku o polovinu.
              </p>
            </div>
          </div>
        </section>

        <section
          className="rounded-3xl border border-white/10 bg-white/0 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.7)] space-y-3"
          style={{ backgroundColor: "rgba(255,255,255,0.025)" }}
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-[0.18em]">
            Výpočet a výše dávky
          </h3>
          <ul className="text-sm text-slate-200 space-y-1 list-disc list-inside">
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
