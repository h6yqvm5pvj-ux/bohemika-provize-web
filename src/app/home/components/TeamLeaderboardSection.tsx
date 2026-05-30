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
    ? "relative h-full overflow-hidden rounded-[30px] border border-slate-200 bg-white px-5 py-5 text-slate-900 sm:px-7 sm:py-6"
    : "relative h-full overflow-hidden rounded-[30px] border border-slate-200 bg-white px-5 py-5 text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)] sm:px-7 sm:py-6";

  const visibleEntries = entries.slice(0, 10);
  const leaderPremium = visibleEntries[0]?.totalPremium ?? 0;
  const premiumBase = leaderPremium > 0 ? leaderPremium : 1;

  const getRankAccent = (idx: number) => {
    if (idx === 0) {
      return {
        chip: "text-amber-100 border-amber-200/72 bg-amber-300/12",
        badge: "border-amber-200/85 bg-[linear-gradient(135deg,#fef08a_0%,#facc15_72%,#eab308_100%)] text-slate-950",
        amount: "text-amber-200",
        aura: "bg-amber-300/24",
        progress: "from-amber-300 to-yellow-300",
      };
    }
    if (idx === 1) {
      return {
        chip: "text-sky-100 border-sky-200/64 bg-sky-300/12",
        badge: "border-sky-100/80 bg-[linear-gradient(135deg,#dbeafe_0%,#bfdbfe_70%,#93c5fd_100%)] text-slate-900",
        amount: "text-sky-200",
        aura: "bg-sky-300/22",
        progress: "from-sky-300 to-cyan-200",
      };
    }
    if (idx === 2) {
      return {
        chip: "text-orange-100 border-orange-200/64 bg-orange-300/12",
        badge: "border-orange-200/82 bg-[linear-gradient(135deg,#fed7aa_0%,#fdba74_68%,#fb923c_100%)] text-slate-950",
        amount: "text-orange-200",
        aura: "bg-orange-300/22",
        progress: "from-orange-300 to-amber-200",
      };
    }

    return {
      chip: "text-violet-100 border-violet-100/38 bg-violet-300/12",
      badge: "border-violet-100/45 bg-violet-300/18 text-violet-50",
      amount: "text-emerald-200",
      aura: "bg-violet-300/20",
      progress: "from-violet-300 to-fuchsia-300",
    };
  };

  const chipGroupClass =
    "inline-flex rounded-full border border-violet-100/34 bg-violet-950/40 p-1";
  const activeChipClass =
    "rounded-full border border-violet-900/65 bg-violet-900/85 px-3 py-1.5 font-semibold text-violet-50 shadow-[0_8px_20px_rgba(26,10,60,0.35)]";
  const idleChipClass =
    "rounded-full border border-transparent px-3 py-1.5 font-semibold text-violet-100/72 transition hover:text-violet-50";

  return (
    <section className={leaderboardClass} data-fixed-box-theme="slate">
      <div className="relative z-10 mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Týmový výkon</p>
          <h2 className="mt-1 inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.75rem]">
            <Trophy className="h-6 w-6 text-amber-500" strokeWidth={1.9} aria-hidden="true" />
            <span>Žebříček týmu</span>
          </h2>
        </div>

        <div className="flex flex-col items-start gap-2 text-[11px] sm:items-end sm:text-xs">
          <div className={chipGroupClass}>
            <button
              type="button"
              onClick={() => onProductFilterChange("life")}
              className={lbProductFilter === "life" ? activeChipClass : idleChipClass}
            >
              Život
            </button>
            <button
              type="button"
              onClick={() => onProductFilterChange("other")}
              className={lbProductFilter === "other" ? activeChipClass : idleChipClass}
            >
              Vedlejší produkty
            </button>
          </div>

          <div className={chipGroupClass}>
            <button
              type="button"
              onClick={() => onRangeChange("month")}
              className={lbRange === "month" ? activeChipClass : idleChipClass}
            >
              Aktuální měsíc
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("sixMonths")}
              className={lbRange === "sixMonths" ? activeChipClass : idleChipClass}
            >
              Posledních 6 měsíců
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("year")}
              className={lbRange === "year" ? activeChipClass : idleChipClass}
            >
              Aktuální rok
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="relative z-10 rounded-2xl border border-violet-100/28 bg-violet-950/30 px-4 py-7 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-violet-100/80">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-violet-100/35 border-t-violet-100"
              aria-hidden="true"
            />
            <span>Načítám týmovou produkci…</span>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="relative z-10 rounded-2xl border border-dashed border-violet-100/32 bg-violet-950/28 px-4 py-7 text-center">
          <p className="text-sm text-violet-100/78">
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
                className="group relative overflow-hidden rounded-[28px] border border-violet-100/34 bg-[radial-gradient(circle_at_16%_0%,rgba(167,139,250,0.24),transparent_44%),linear-gradient(160deg,#2d1357_0%,#1b0b40_58%,#100726_100%)] px-4 py-3 shadow-[0_16px_34px_rgba(11,3,33,0.42)] sm:px-5 sm:py-4"
              >
                <span className={`pointer-events-none absolute -left-10 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full blur-3xl ${accents.aura}`} />
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(128deg,rgba(255,255,255,0.13)_0%,rgba(255,255,255,0)_40%)]" />

                <div className="relative flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${accents.badge}`}
                      >
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[1.55rem] font-semibold leading-none text-violet-50 sm:text-[1.8rem]">
                          {row.name}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[11px] text-violet-100/72">{leaderboardLabel}</span>
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
                      <div className="text-[10px] uppercase tracking-[0.14em] text-violet-100/62">Pojistné</div>
                      <div className={`whitespace-nowrap text-[1.95rem] font-semibold leading-none sm:text-[2.45rem] ${accents.amount}`}>
                        <AnimatedMoney value={row.totalPremium} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[10px] text-violet-100/62">
                      <span>Výkon vůči 1. místu</span>
                      <span>{progress} %</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100/17">
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
