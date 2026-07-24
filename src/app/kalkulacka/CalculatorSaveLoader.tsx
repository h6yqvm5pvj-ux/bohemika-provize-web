"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, DatabaseZap, FileCheck2, ShieldCheck, UploadCloud } from "lucide-react";

type CalculatorSaveLoaderProps = {
  message?: string | null;
};

const SAVE_STAGES = [
  "Kontroluji duplicity",
  "Připravuji záznam smlouvy",
  "Ukládám data do systému",
  "Nahrávám přílohy",
  "Aktualizuji přehled smluv",
];

const SAVE_CHECKS = [
  { label: "Duplicity", icon: ShieldCheck },
  { label: "Záznam", icon: DatabaseZap },
  { label: "PDF", icon: UploadCloud },
  { label: "Hotovo", icon: CheckCircle2 },
];

export function CalculatorSaveLoader({ message }: CalculatorSaveLoaderProps) {
  const [progress, setProgress] = useState(18);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 96) return current;
        if (current < 42) return Math.min(96, current + 4);
        if (current < 76) return Math.min(96, current + 2);
        return Math.min(96, current + 1);
      });
    }, 170);

    return () => window.clearInterval(interval);
  }, []);

  const visibleProgress = Math.max(18, Math.min(96, Math.round(progress)));
  const stageIndex = Math.min(
    SAVE_STAGES.length - 1,
    Math.floor((visibleProgress / 100) * SAVE_STAGES.length)
  );
  const stageText = SAVE_STAGES[stageIndex];
  const progressStyle = useMemo(
    () => ({ width: `${visibleProgress}%` }),
    [visibleProgress]
  );
  const normalizedMessage = message?.trim();

  return (
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/60 px-3 py-6 backdrop-blur-[10px] sm:px-6"
      role="status"
      aria-live="polite"
      aria-label="Ukládám smlouvu"
      aria-busy="true"
    >
      <section className="relative w-full max-w-5xl overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(145deg,#ffffff_0%,#fbfbff_52%,#f5f3ff_100%)] px-5 py-6 shadow-[0_30px_90px_rgba(15,23,42,0.20)] sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#020617_0%,#6d28d9_100%)]" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(118deg,transparent_0%,transparent_36%,rgba(109,40,217,0.08)_36%,rgba(109,40,217,0.025)_58%,transparent_58%,transparent_100%)]" aria-hidden="true" />

        <div className="relative z-10 grid min-h-[360px] grid-cols-1 items-center gap-7 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
          <div className="space-y-7">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-200 bg-white text-violet-700 shadow-[0_14px_30px_rgba(109,40,217,0.12)]">
                <FileCheck2 className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-black">Uložení smlouvy</p>
                <p className="text-sm text-black/55">Bohemka.App</p>
              </div>
            </div>

            <div>
              <div className="flex items-end gap-2 font-mono text-7xl font-semibold leading-none text-black sm:text-8xl">
                <span>{visibleProgress}</span>
                <span className="pb-2 text-3xl text-violet-700 sm:text-4xl">%</span>
              </div>

              <h1
                key={stageText}
                className="mt-5 max-w-2xl text-3xl font-semibold leading-tight text-black motion-safe:animate-[calculator-save-stage_420ms_ease-out_both] sm:text-4xl"
              >
                {stageText}
              </h1>
              <p className="mt-3 max-w-xl text-base font-bold leading-6 text-slate-500">
                {normalizedMessage && normalizedMessage !== `${stageText}…`
                  ? normalizedMessage
                  : "Kontroluji údaje, ukládám záznam a propisuji změny do přehledu smluv."}
              </p>
            </div>

            <div>
              <div
                className="h-5 overflow-hidden rounded-full border border-slate-200 bg-white shadow-inner"
                role="progressbar"
                aria-label="Průběh ukládání smlouvy"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={visibleProgress}
              >
                <div
                  className="relative h-full min-w-7 rounded-full bg-[linear-gradient(90deg,#312e81_0%,#6d28d9_100%)] shadow-[0_0_24px_rgba(109,40,217,0.28)] transition-[width] duration-300 ease-out"
                  style={progressStyle}
                >
                  <span className="absolute inset-0 rounded-full bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.22)_0,rgba(255,255,255,0.22)_0.55rem,transparent_0.55rem,transparent_1.1rem)] motion-safe:animate-[calculator-save-stripes_740ms_linear_infinite]" />
                </div>
              </div>
              <div className="mt-3 h-px w-full bg-[linear-gradient(90deg,rgba(2,6,23,0.16),rgba(109,40,217,0.24),rgba(2,6,23,0))]" />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white/80 p-4 shadow-[0_24px_58px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(2,6,23,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(2,6,23,0.045)_1px,transparent_1px)] [background-size:28px_28px]" aria-hidden="true" />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-black">
                <DatabaseZap className="h-5 w-5 text-violet-700" strokeWidth={2.2} aria-hidden="true" />
                Průběh uložení
              </div>
              <div className="text-sm font-semibold text-black/50">probíhá</div>
            </div>

            <div className="relative z-10 mt-5 space-y-3">
              {SAVE_CHECKS.map((item, index) => {
                const Icon = item.icon;
                const active = index <= stageIndex;

                return (
                  <div
                    key={item.label}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-3 shadow-sm transition ${
                      active
                        ? "border-violet-200 bg-violet-50 text-violet-800"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        active ? "bg-violet-700 !text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black">{item.label}</div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/80">
                        <span
                          className={`block h-full rounded-full transition-[width] duration-300 ${
                            active ? "bg-violet-700" : "bg-slate-200"
                          }`}
                          style={{ width: active ? "100%" : "34%" }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
