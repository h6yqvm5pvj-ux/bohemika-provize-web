"use client";

import { useMemo } from "react";
import { Network, UsersRound } from "lucide-react";

import introStyles from "../cashflow/cashflowIntro.module.css";

type TeamOverviewLoaderProps = {
  progress: number;
};

const TEAM_LOADING_STAGES = [
  "Skládám týmovou strukturu",
  "Propojuji členy podle vazeb",
  "Načítám poslední aktivitu",
  "Připravuji produkční přehled",
  "Řadím tým podle výkonu",
];

const TEAM_NODES = [
  { label: "JR", className: "teamLoaderNodeA" },
  { label: "PM", className: "teamLoaderNodeB" },
  { label: "AK", className: "teamLoaderNodeC" },
  { label: "MN", className: "teamLoaderNodeD" },
  { label: "TD", className: "teamLoaderNodeE" },
  { label: "LV", className: "teamLoaderNodeF" },
];

export function TeamOverviewLoader({ progress }: TeamOverviewLoaderProps) {
  const visibleProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const stageIndex = Math.min(
    TEAM_LOADING_STAGES.length - 1,
    Math.floor((visibleProgress / 100) * TEAM_LOADING_STAGES.length)
  );
  const progressStyle = useMemo(
    () => ({ width: `${visibleProgress}%` }),
    [visibleProgress]
  );
  const networkStyle = useMemo(
    () => ({
      ["--team-loader-progress" as string]: `${visibleProgress}%`,
    }),
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
              <UsersRound className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-black">Můj tým</p>
              <p className="text-sm text-black/55">Týmový engine</p>
            </div>
          </div>

          <div>
            <div className="flex items-end gap-2 font-mono text-7xl font-semibold leading-none text-black sm:text-8xl lg:text-9xl">
              <span>{visibleProgress}</span>
              <span className="pb-2 text-3xl text-fuchsia-700 sm:text-4xl lg:pb-3">%</span>
            </div>

            <h1
              key={TEAM_LOADING_STAGES[stageIndex]}
              className={`${introStyles.initialLoaderStage} mt-5 max-w-4xl text-3xl font-semibold leading-tight text-black sm:text-4xl`}
            >
              {TEAM_LOADING_STAGES[stageIndex]}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-black/55">
              <span>Členové týmu</span>
              <span aria-hidden="true">·</span>
              <span>Aktivita</span>
              <span aria-hidden="true">·</span>
              <span>Produkce</span>
            </div>
          </div>

          <div
            className={introStyles.initialLoaderProgress}
            role="progressbar"
            aria-label="Průběh načítání týmu"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={visibleProgress}
          >
            <span className={introStyles.initialLoaderProgressFill} style={progressStyle} />
          </div>
        </div>

        <div className={introStyles.initialLoaderConsole} aria-hidden="true">
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-black">
              <Network className="h-5 w-5 text-fuchsia-700" strokeWidth={2.2} />
              Týmová mapa
            </div>
            <div className="text-sm font-semibold text-black/50">spojuji vazby</div>
          </div>

          <div className={introStyles.teamLoaderNetwork} style={networkStyle}>
            {["A", "B", "C", "D", "E", "F"].map((line) => (
              <span
                key={line}
                className={`${introStyles.teamLoaderConnection} ${
                  introStyles[`teamLoaderConnection${line}` as keyof typeof introStyles]
                }`}
              />
            ))}

            <span className={`${introStyles.teamLoaderNode} ${introStyles.teamLoaderLead}`}>
              <UsersRound className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
              <span>TY</span>
            </span>

            {TEAM_NODES.map((node) => (
              <span
                key={node.label}
                className={`${introStyles.teamLoaderNode} ${
                  introStyles[node.className as keyof typeof introStyles]
                }`}
              >
                {node.label}
              </span>
            ))}

            <div className={introStyles.teamLoaderRoster}>
              {[0, 1, 2].map((index) => (
                <span key={index} style={{ ["--team-card-index" as string]: index }}>
                  <span />
                  <span />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
