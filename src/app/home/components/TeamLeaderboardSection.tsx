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
    ? "relative h-full overflow-hidden rounded-[24px] border border-slate-200 bg-white px-6 py-6 transition-[border-color,box-shadow] duration-200 hover:border-slate-300 focus-within:border-slate-300 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.35)] sm:px-10 sm:py-7"
    : "relative h-full overflow-hidden rounded-[24px] border border-slate-200 bg-white px-6 py-6 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.1)] focus-within:border-slate-300 focus-within:shadow-[0_12px_28px_rgba(15,23,42,0.1),0_0_0_1px_rgba(148,163,184,0.35)] sm:px-10 sm:py-7";

  return (
    <section className={leaderboardClass}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5 relative z-10">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
            Žebříček týmu
          </h2>
        </div>

        <div className="flex flex-col items-start gap-2 text-[11px] sm:items-end sm:text-xs">
          <div className="inline-flex rounded-full border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => onProductFilterChange("life")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbProductFilter === "life"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Život
            </button>
            <button
              type="button"
              onClick={() => onProductFilterChange("other")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbProductFilter === "other"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Vedlejší produkty
            </button>
          </div>

          <div className="inline-flex rounded-full border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => onRangeChange("month")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbRange === "month"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Aktuální měsíc
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("sixMonths")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbRange === "sixMonths"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Posledních 6 měsíců
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("year")}
              className={`px-3 py-1.5 rounded-full transition ${
                lbRange === "year"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Aktuální rok
            </button>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-slate-600 sm:text-sm">
          Pro zvolené období a typ produktu zatím nemá tým žádnou produkci.
        </p>
      ) : (
        <ol className="mt-2 space-y-2 relative z-10">
          {entries.slice(0, 10).map((row, idx) => (
            <li
              key={row.email}
              className="relative overflow-hidden rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.14)] sm:px-5 sm:py-4"
            >
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ring-2 ${
                      idx === 0
                        ? "bg-slate-950 text-white ring-white ring-offset-2 ring-offset-slate-900"
                        : idx === 1
                          ? "bg-slate-950 text-white ring-white ring-offset-2 ring-offset-slate-900"
                          : idx === 2
                            ? "bg-slate-950 text-white ring-white ring-offset-2 ring-offset-slate-900"
                            : "bg-slate-950 text-white ring-white ring-offset-2 ring-offset-slate-900"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white sm:text-base">
                      {row.name}
                    </div>
                    <div className="text-[11px] text-white/70">
                      {leaderboardLabel}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-white/70">
                    Pojistné
                  </div>
                  <div className="text-lg font-semibold text-white sm:text-xl">
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
