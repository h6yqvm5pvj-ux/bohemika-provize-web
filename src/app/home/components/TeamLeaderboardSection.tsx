import { Trophy } from "lucide-react";
import { AnimatedMoney } from "./AnimatedNumbers";

import { type TeamLeaderboardEntry } from "../types";

type Props = {
  loading: boolean;
  entries: TeamLeaderboardEntry[];
  leaderboardLabel: string;
  lbProductFilter: "life" | "other";
  lbRange: "month" | "sixMonths" | "year";
  onProductFilterChange: (val: "life" | "other") => void;
  onRangeChange: (val: "month" | "sixMonths" | "year") => void;
  isLiteUI: boolean;
};

export function TeamLeaderboardSection({
  loading,
  entries,
  leaderboardLabel,
  lbProductFilter,
  lbRange,
  onProductFilterChange,
  onRangeChange,
  isLiteUI,
}: Props) {
  const leaderboardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-5 sm:px-7 sm:py-6"
    : "relative h-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.07)] sm:px-7 sm:py-6";

  const visibleEntries = entries.slice(0, 10);
  const leaderPremium = visibleEntries[0]?.totalPremium ?? 0;
  const premiumBase = leaderPremium > 0 ? leaderPremium : 1;

  const getInitials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");

  const getRankAccent = (idx: number) => {
    if (idx === 0) {
      return {
        chip: "text-amber-100 border-amber-200/60 bg-amber-300/12",
        badge: "border-amber-200/80 bg-gradient-to-br from-amber-200 via-amber-300 to-yellow-400 text-slate-950",
        amount: "text-amber-200",
        glow: "from-amber-300/18 via-amber-200/8 to-transparent",
        progress: "from-amber-300 to-yellow-300",
      };
    }
    if (idx === 1) {
      return {
        chip: "text-sky-100 border-sky-200/60 bg-sky-300/10",
        badge: "border-sky-100/80 bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 text-slate-900",
        amount: "text-sky-200",
        glow: "from-sky-300/16 via-cyan-200/8 to-transparent",
        progress: "from-sky-300 to-cyan-200",
      };
    }
    if (idx === 2) {
      return {
        chip: "text-orange-100 border-orange-200/60 bg-orange-300/10",
        badge: "border-orange-200/80 bg-gradient-to-br from-orange-200 via-orange-300 to-amber-400 text-slate-950",
        amount: "text-orange-200",
        glow: "from-orange-300/16 via-amber-200/8 to-transparent",
        progress: "from-orange-300 to-amber-200",
      };
    }
    return {
      chip: "text-slate-200 border-white/15 bg-white/8",
      badge: "border-white/35 bg-slate-800 text-slate-100",
      amount: "text-emerald-200",
      glow: "from-emerald-300/12 via-emerald-200/5 to-transparent",
      progress: "from-emerald-300 to-teal-200",
    };
  };

  return (
    <section className={leaderboardClass}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_0%,rgba(16,185,129,0.12),transparent_42%)]" />

      <div className="relative z-10 mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
            Týmový výkon
          </p>
          <h2 className="mt-1 inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.75rem]">
            <Trophy className="h-6 w-6 text-amber-500" strokeWidth={1.9} aria-hidden="true" />
            <span>Žebříček týmu</span>
          </h2>
        </div>

        <div className="flex flex-col items-start gap-2 text-[11px] sm:items-end sm:text-xs">
          <div className="ui-chip-group">
            <button
              type="button"
              onClick={() => onProductFilterChange("life")}
              className={`ui-chip ui-focus px-3 py-1.5 ${
                lbProductFilter === "life"
                  ? "ui-chip-active"
                  : ""
              }`}
            >
              Život
            </button>
            <button
              type="button"
              onClick={() => onProductFilterChange("other")}
              className={`ui-chip ui-focus px-3 py-1.5 ${
                lbProductFilter === "other"
                  ? "ui-chip-active"
                  : ""
              }`}
            >
              Vedlejší produkty
            </button>
          </div>

          <div className="ui-chip-group">
            <button
              type="button"
              onClick={() => onRangeChange("month")}
              className={`ui-chip ui-focus px-3 py-1.5 ${
                lbRange === "month"
                  ? "ui-chip-active"
                  : ""
              }`}
            >
              Aktuální měsíc
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("sixMonths")}
              className={`ui-chip ui-focus px-3 py-1.5 ${
                lbRange === "sixMonths"
                  ? "ui-chip-active"
                  : ""
              }`}
            >
              Posledních 6 měsíců
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("year")}
              className={`ui-chip ui-focus px-3 py-1.5 ${
                lbRange === "year"
                  ? "ui-chip-active"
                  : ""
              }`}
            >
              Aktuální rok
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="relative z-10 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-7 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-slate-600">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
              aria-hidden="true"
            />
            <span>Načítám týmovou produkci…</span>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="relative z-10 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-7 text-center">
          <p className="text-sm text-slate-600">
            Pro zvolené období a typ produktu zatím nemá tým žádnou produkci.
          </p>
        </div>
      ) : (
        <ol className="relative z-10 mt-2 space-y-3">
          {visibleEntries.map((row, idx) => {
            const accents = getRankAccent(idx);
            const progress = Math.max(
              0,
              Math.min(100, Math.round((row.totalPremium / premiumBase) * 100))
            );

            return (
            <li
              key={row.email}
              className="group relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 px-4 py-3 shadow-[0_14px_26px_rgba(2,6,23,0.35)] sm:px-5 sm:py-4"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${accents.glow}`} />

              <div className="relative flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${accents.badge}`}
                    >
                      {idx + 1}
                    </div>
                    <div
                      className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/6 text-[11px] font-semibold text-slate-200 sm:flex`}
                    >
                      {getInitials(row.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white sm:text-base">
                        {row.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[11px] text-white/70">{leaderboardLabel}</span>
                        {idx < 3 ? (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${accents.chip}`}
                          >
                            Top {idx + 1}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">
                      Pojistné
                    </div>
                    <div className={`text-lg font-semibold sm:text-xl ${accents.amount}`}>
                      <AnimatedMoney value={row.totalPremium} />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/60">
                    <span>Výkon vůči 1. místu</span>
                    <span>{progress} %</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${accents.progress} transition-[width] duration-300`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
