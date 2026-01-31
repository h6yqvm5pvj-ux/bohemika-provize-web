import { AnimatedMoney } from "./AnimatedNumbers";

import { type TeamLeaderboardEntry } from "../types";

type Props = {
  entries: TeamLeaderboardEntry[];
  leaderboardLabel: string;
  lbProductFilter: "life" | "other";
  lbRange: "month" | "sixMonths" | "year";
  onProductFilterChange: (val: "life" | "other") => void;
  onRangeChange: (val: "month" | "sixMonths" | "year") => void;
  isLiteUI: boolean;
};

export function TeamLeaderboardSection({
  entries,
  leaderboardLabel,
  lbProductFilter,
  lbRange,
  onProductFilterChange,
  onRangeChange,
  isLiteUI,
}: Props) {
  const leaderboardClass = isLiteUI
    ? "rounded-3xl border border-emerald-400/40 bg-emerald-950/70 px-6 py-6 sm:px-10 sm:py-7 h-full"
    : "rounded-3xl border border-emerald-400/40 bg-emerald-500/5 backdrop-blur-2xl px-6 py-6 sm:px-10 sm:py-7 shadow-[0_30px_90px_rgba(0,0,0,0.9)] h-full";

  return (
    <section className={leaderboardClass}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-emerald-100">
            Žebříček týmu
          </h2>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2 text-[11px] sm:text-xs">
          <div className="inline-flex rounded-full bg-emerald-900/50 border border-emerald-400/50 p-1">
            <button
              type="button"
              onClick={() => onProductFilterChange("life")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbProductFilter === "life"
                  ? "bg-white text-slate-900 shadow-md"
                  : "text-emerald-100 hover:bg-white/5"
              }`}
            >
              Život
            </button>
            <button
              type="button"
              onClick={() => onProductFilterChange("other")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbProductFilter === "other"
                  ? "bg-white text-slate-900 shadow-md"
                  : "text-emerald-100 hover:bg-white/5"
              }`}
            >
              Vedlejší produkty
            </button>
          </div>

          <div className="inline-flex rounded-full bg-emerald-900/50 border border-emerald-400/50 p-1">
            <button
              type="button"
              onClick={() => onRangeChange("month")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbRange === "month"
                  ? "bg-emerald-400 text-slate-900 shadow-md"
                  : "text-emerald-100 hover:bg-white/5"
              }`}
            >
              Aktuální měsíc
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("sixMonths")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbRange === "sixMonths"
                  ? "bg-emerald-400 text-slate-900 shadow-md"
                  : "text-emerald-100 hover:bg-white/5"
              }`}
            >
              Posledních 6 měsíců
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("year")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbRange === "year"
                  ? "bg-emerald-400 text-slate-900 shadow-md"
                  : "text-emerald-100 hover:bg-white/5"
              }`}
            >
              Aktuální rok
            </button>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs sm:text-sm text-emerald-100/80">
          Pro zvolené období a typ produktu zatím nemá tým žádnou produkci.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {entries.slice(0, 10).map((row, idx) => (
            <li
              key={row.email}
              className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/15 via-slate-950/80 to-slate-950/90 px-4 py-3 sm:px-5 sm:py-4"
            >
              <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.35),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.3),transparent_55%)]" />

              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                      idx === 0
                        ? "bg-amber-400 text-slate-900"
                        : idx === 1
                          ? "bg-slate-300 text-slate-900"
                          : idx === 2
                            ? "bg-amber-700 text-slate-50"
                            : "bg-emerald-900/70 text-emerald-200"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-sm sm:text-base font-semibold text-slate-50">
                      {row.name}
                    </div>
                    <div className="text-[11px] text-emerald-200/80">
                      {leaderboardLabel}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-emerald-300/90">
                    Pojistné
                  </div>
                  <div className="text-lg sm:text-xl font-semibold text-emerald-100">
                    <AnimatedMoney value={row.totalPremium} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
