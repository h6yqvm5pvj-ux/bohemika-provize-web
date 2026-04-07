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
  const leaderboardClass = `ui-card ${isLiteUI ? "ui-card-quiet" : ""} relative h-full overflow-hidden px-6 py-6 sm:px-10 sm:py-7`;

  return (
    <section className={leaderboardClass}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5 relative z-10">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
            Žebříček týmu
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
                  <div className="text-lg font-semibold text-emerald-300 sm:text-xl">
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
