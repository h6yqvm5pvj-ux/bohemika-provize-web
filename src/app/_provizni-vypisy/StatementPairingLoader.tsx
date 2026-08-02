"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, SearchCheck } from "lucide-react";

import introStyles from "../cashflow/cashflowIntro.module.css";
import type { ContractMatchStats } from "./statementTypes";

type StatementPairingLoaderProps = {
  stats: ContractMatchStats;
  hasUser: boolean;
};

const PAIRING_STAGES = [
  "Načítám provizní výpis",
  "Páruji smlouvy podle čísel",
  "Hledám shody v uložených smlouvách",
  "Kontroluji provizní položky",
  "Skládám výsledky kontroly",
  "Připravuji přehled nesrovnalostí",
];

export function StatementPairingLoader({
  stats,
  hasUser,
}: StatementPairingLoaderProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const isComplete = stats.total > 0 && stats.completed >= stats.total;
  const activeCount = stats.loading + stats.pending;
  const rawProgress = Math.max(0, Math.min(100, stats.progress));
  const hasActiveWork = hasUser && !isComplete && stats.total > 0 && activeCount > 0;
  const visibleProgress = hasActiveWork && rawProgress === 0 ? 4 : rawProgress;
  const completedText =
    hasActiveWork && stats.completed === 0
      ? "První dávka běží"
      : `${stats.completed}/${stats.total} hotovo`;
  const pileSheetCount = Math.max(4, Math.min(12, Math.ceil(visibleProgress / 10) + 2));

  useEffect(() => {
    if (isComplete || !hasUser) return;

    const interval = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % PAIRING_STAGES.length);
    }, 1150);

    return () => window.clearInterval(interval);
  }, [hasUser, isComplete]);

  const stageText = !hasUser
    ? "Čekám na přihlášení"
    : isComplete
      ? "Párování dokončeno"
      : PAIRING_STAGES[stageIndex];
  const progressStyle = useMemo(
    () => ({ width: `${visibleProgress}%` }),
    [visibleProgress]
  );
  const documentStackStyle = useMemo(
    () => ({
      ["--statement-pile-height" as string]: `${76 + visibleProgress * 0.82}px`,
    }),
    [visibleProgress]
  );

  return (
    <section
      className={`${introStyles.initialLoaderShell} min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-[32px] border border-white/80 px-4 py-6 shadow-[0_28px_88px_rgba(15,23,42,0.14)] sm:px-7 sm:py-8 lg:px-10`}
      aria-busy={!isComplete}
      aria-live="polite"
    >
      <span className={introStyles.initialLoaderBeam} aria-hidden="true" />

      <div className="relative z-10 grid min-h-[calc(100vh-11.5rem)] grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-fuchsia-200 bg-white text-fuchsia-700 shadow-[0_14px_30px_rgba(162,28,175,0.13)]">
              <FileText className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-black">Provizní výpisy</p>
              <p className="text-sm text-black/55">Párovací engine</p>
            </div>
          </div>

          <div>
            <div className="flex items-end gap-2 font-mono text-7xl font-semibold leading-none text-black sm:text-8xl lg:text-9xl">
              <span>{visibleProgress}</span>
              <span className="pb-2 text-3xl text-fuchsia-700 sm:text-4xl lg:pb-3">%</span>
            </div>

            <h1
              key={stageText}
              className={`${introStyles.initialLoaderStage} mt-5 max-w-4xl text-3xl font-semibold leading-tight text-black sm:text-4xl`}
            >
              {stageText}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-black/55">
              <span>{completedText}</span>
              <span aria-hidden="true">·</span>
              <span>{activeCount > 0 ? `Páruji ${activeCount} smluv` : "Dokončuji kontrolu"}</span>
            </div>
          </div>

          <div
            className={introStyles.initialLoaderProgress}
            role="progressbar"
            aria-label="Průběh párování provizního výpisu"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={visibleProgress}
          >
            <span className={introStyles.initialLoaderProgressFill} style={progressStyle} />
          </div>
        </div>

        <div className={introStyles.initialLoaderConsole} style={documentStackStyle} aria-hidden="true">
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-black">
              <SearchCheck className="h-5 w-5 text-fuchsia-700" strokeWidth={2.2} />
              Skládání smluv
            </div>
            <div className="text-sm font-semibold text-black/50">hromada roste</div>
          </div>

          <div className={introStyles.statementLoaderDropZone}>
            {[0, 1, 2, 3, 4].map((paperIndex) => (
              <span
                key={paperIndex}
                className={introStyles.statementLoaderPaper}
                style={{ ["--paper-index" as string]: paperIndex }}
              >
                <span />
                <span />
                <span />
              </span>
            ))}

            <div className={introStyles.statementLoaderPile}>
              {Array.from({ length: pileSheetCount }, (_, sheetIndex) => {
                const xOffset = ((sheetIndex % 5) - 2) * 7;
                const rotation = ((sheetIndex % 6) - 2.5) * 1.6;

                return (
                  <span
                    key={sheetIndex}
                    style={{
                      bottom: `${sheetIndex * 7}px`,
                      transform: `translateX(${xOffset}px) rotate(${rotation}deg)`,
                      zIndex: sheetIndex + 1,
                    }}
                  >
                    <span />
                    <span />
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
