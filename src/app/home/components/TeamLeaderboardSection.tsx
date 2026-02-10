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
    ? "relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-black/70 via-black/65 to-black/60 px-6 py-6 sm:px-10 sm:py-7 h-full shadow-[0_18px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
    : "relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-black/70 via-black/65 to-black/60 px-6 py-6 sm:px-10 sm:py-7 h-full shadow-[0_18px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl";

  return (
    <section className={leaderboardClass}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/10 via-white/4 to-transparent" />
      <div className="pointer-events-none absolute -left-16 -top-16 h-32 w-48 rotate-12 bg-white/18 blur-3xl opacity-70" />
      <div className="pointer-events-none absolute -right-12 bottom-[-18px] h-24 w-36 rotate-6 bg-emerald-200/12 blur-2xl" />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5 relative z-10">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-emerald-100">
            Žebříček týmu
          </h2>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2 text-[11px] sm:text-xs">
          <div className="inline-flex rounded-full bg-black/50 border border-white/15 p-1 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => onProductFilterChange("life")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbProductFilter === "life"
                  ? "bg-white text-slate-900 shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
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
                  ? "bg-white text-slate-900 shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
                  : "text-emerald-100 hover:bg-white/5"
              }`}
            >
              Vedlejší produkty
            </button>
          </div>

          <div className="inline-flex rounded-full bg-black/50 border border-white/15 p-1 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => onRangeChange("month")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbRange === "month"
                  ? "bg-emerald-400 text-slate-900 shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
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
                  ? "bg-emerald-400 text-slate-900 shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
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
                  ? "bg-emerald-400 text-slate-900 shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
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
        <ol className="mt-2 space-y-2 relative z-10">
          {entries.slice(0, 10).map((row, idx) => (
            <li
              key={row.email}
              className="relative overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-br from-white/12 via-white/6 to-white/5 px-4 py-3 sm:px-5 sm:py-4 shadow-[0_14px_36px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
            >
              <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.22),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.25),transparent_55%)]" />

              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ring-2 ${
                      idx === 0
                        ? "bg-black/60 text-amber-200 ring-amber-300 ring-offset-2 ring-offset-black/50 shadow-[0_0_0_4px_rgba(251,191,36,0.2)]"
                        : idx === 1
                          ? "bg-black/60 text-slate-200 ring-slate-200 ring-offset-2 ring-offset-black/50 shadow-[0_0_0_4px_rgba(226,232,240,0.2)]"
                          : idx === 2
                            ? "bg-black/60 text-orange-200 ring-orange-400 ring-offset-2 ring-offset-black/50 shadow-[0_0_0_4px_rgba(251,146,60,0.22)]"
                            : "bg-black/60 text-emerald-200 ring-emerald-300/60 ring-offset-2 ring-offset-black/50 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]"
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
