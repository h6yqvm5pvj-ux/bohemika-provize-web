import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarRange, TrendingUp } from "lucide-react";

import introStyles from "../cashflowIntro.module.css";

type CashflowInitialLoaderProps = {
  completing: boolean;
  tipsterMode?: boolean;
};

const ADVISOR_STAGES = [
  "Načítám provize",
  "Kontroluji aktivní smlouvy",
  "Skládám provize do měsíců",
  "Páruji výpisy s výplatami",
  "Počítám čisté cashflow",
  "Připravuji provizní kalendář",
];

const TIPSTER_STAGES = [
  "Načítám TIP provize",
  "Kontroluji sjednané tipy",
  "Skládám výplaty do měsíců",
  "Počítám očekávané cashflow",
  "Připravuji provizní kalendář",
];

export function CashflowInitialLoader({
  completing,
  tipsterMode = false,
}: CashflowInitialLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const stages = useMemo(
    () => (tipsterMode ? TIPSTER_STAGES : ADVISOR_STAGES),
    [tipsterMode]
  );

  useEffect(() => {
    if (completing) return;

    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 96) return current;
        if (current < 18) return Math.min(96, current + 5);
        if (current < 58) return Math.min(96, current + 3);
        return Math.min(96, current + 1);
      });
    }, 145);

    return () => window.clearInterval(interval);
  }, [completing]);

  useEffect(() => {
    if (completing) return;

    const interval = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % stages.length);
    }, 1150);

    return () => window.clearInterval(interval);
  }, [completing, stages]);

  const visibleProgress = completing ? 100 : progress;
  const stageText = completing ? "Hotovo. Otevírám kalendář." : stages[stageIndex];
  const progressStyle = useMemo(
    () => ({ width: `${Math.max(0, Math.min(100, visibleProgress))}%` }),
    [visibleProgress]
  );

  return (
    <section
      className={`${introStyles.initialLoaderShell} min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-[32px] border border-white/80 px-4 py-6 shadow-[0_28px_88px_rgba(15,23,42,0.14)] sm:px-7 sm:py-8 lg:px-10`}
      aria-busy="true"
      aria-live="polite"
    >
      <span className={introStyles.initialLoaderBeam} aria-hidden="true" />

      <div className="relative z-10 grid min-h-[calc(100vh-11.5rem)] grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-fuchsia-200 bg-white text-fuchsia-700 shadow-[0_14px_30px_rgba(162,28,175,0.13)]">
              <CalendarRange className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-black">Provizní kalendář</p>
              <p className="text-sm text-black/55">
                {tipsterMode ? "TIP cashflow" : "Cashflow engine"}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-end gap-2 font-mono text-7xl font-semibold leading-none text-black sm:text-8xl lg:text-9xl">
              <span>{Math.round(visibleProgress)}</span>
              <span className="pb-2 text-3xl text-fuchsia-700 sm:text-4xl lg:pb-3">%</span>
            </div>

            <h1
              key={stageText}
              className={`${introStyles.initialLoaderStage} mt-5 max-w-4xl text-3xl font-semibold leading-tight text-black sm:text-4xl`}
            >
              {stageText}
            </h1>
          </div>

          <div
            className={introStyles.initialLoaderProgress}
            role="progressbar"
            aria-label="Načítání provizního kalendáře"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(visibleProgress)}
          >
            <span className={introStyles.initialLoaderProgressFill} style={progressStyle} />
          </div>
        </div>

        <div className={introStyles.initialLoaderConsole} aria-hidden="true">
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-black">
              <TrendingUp className="h-5 w-5 text-fuchsia-700" strokeWidth={2.2} />
              Graf cashflow
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-black">
              <ArrowUpRight className="h-4 w-4 text-[#16a34a]" strokeWidth={2.6} />
              růst
            </div>
          </div>

          <div className={introStyles.initialLoaderChart}>
            <div className="relative z-10 flex justify-end">
              <ArrowUpRight
                className={introStyles.initialLoaderGrowthArrow}
                strokeWidth={2.8}
              />
            </div>

            <div className={introStyles.initialLoaderChartBars}>
              {[32, 44, 39, 58, 67, 74, 88].map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  style={{
                    height: `${height}%`,
                    ["--cf-bar" as string]: String(index),
                  }}
                />
              ))}
            </div>

            <svg
              className={introStyles.initialLoaderChartSvg}
              viewBox="0 0 420 210"
              preserveAspectRatio="none"
            >
              <path
                d="M24 184 C84 166 104 142 146 150 C194 160 205 112 246 116 C292 120 304 78 348 74 C376 72 394 50 410 34 L410 210 L24 210 Z"
                fill="rgba(217,70,239,0.1)"
              />
              <path
                className={introStyles.initialLoaderChartStroke}
                d="M24 184 C84 166 104 142 146 150 C194 160 205 112 246 116 C292 120 304 78 348 74 C376 72 394 50 410 34"
                fill="none"
                stroke="#d946ef"
                strokeWidth="7"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
