import { HeartPulse, Layers3, Trophy } from "lucide-react";
import { AnimatedMoney } from "./AnimatedNumbers";

import { type AppLanguage } from "@/lib/appLanguage";
import { type TeamLeaderboardEntry } from "../types";

type Props = {
  language: AppLanguage;
  loading: boolean;
  entries: TeamLeaderboardEntry[];
  leaderboardLabel: string;
  lbProductFilter: "life" | "other";
  lbRange: "month" | "sixMonths" | "year";
  onProductFilterChange: (val: "life" | "other") => void;
  onRangeChange: (val: "month" | "sixMonths" | "year") => void;
  isLiteUI: boolean;
};

const TEAM_LEADERBOARD_COPY: Record<
  AppLanguage,
  {
    kicker: string;
    title: string;
    life: string;
    other: string;
    month: string;
    sixMonths: string;
    year: string;
    loading: string;
    empty: string;
    premium: string;
  }
> = {
  cs: {
    kicker: "Týmový výkon",
    title: "Žebříček týmu",
    life: "Život",
    other: "Vedlejší produkty",
    month: "Tento měsíc",
    sixMonths: "6M",
    year: "12M",
    loading: "Načítám týmovou produkci…",
    empty: "Pro zvolené období a typ produktu zatím nemá tým žádnou produkci.",
    premium: "Pojistné",
  },
};

export function TeamLeaderboardSection({
  language,
  loading,
  entries,
  leaderboardLabel,
  lbProductFilter,
  lbRange,
  onProductFilterChange,
  onRangeChange,
  isLiteUI,
}: Props) {
  const copy = TEAM_LEADERBOARD_COPY[language];
  const leaderboardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[30px] border border-sky-300/30 bg-[radial-gradient(circle_at_14%_0%,rgba(56,189,248,0.2),transparent_42%),linear-gradient(165deg,#271347_0%,#160934_58%,#0d0521_100%)] px-5 py-5 text-white transition-[border-color,box-shadow] duration-200 hover:border-sky-200/55 sm:px-7 sm:py-6"
    : "relative h-full overflow-hidden rounded-[30px] border border-sky-300/30 bg-[radial-gradient(circle_at_14%_0%,rgba(56,189,248,0.2),transparent_42%),linear-gradient(165deg,#271347_0%,#160934_58%,#0d0521_100%)] px-5 py-5 text-white shadow-[0_20px_44px_rgba(11,3,33,0.5)] transition-[border-color,box-shadow] duration-200 hover:border-sky-200/55 hover:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(186,230,253,0.18)] sm:px-7 sm:py-6";

  const visibleEntries = entries.slice(0, 10);

  const getRankAccent = (idx: number) => {
    if (idx === 0) {
      return {
        badge: "border-amber-200/85 bg-[linear-gradient(135deg,#fef08a_0%,#facc15_72%,#eab308_100%)] text-slate-950",
        amount: "text-amber-200",
        aura: "bg-amber-300/24",
      };
    }
    if (idx === 1) {
      return {
        badge: "border-sky-100/80 bg-[linear-gradient(135deg,#dbeafe_0%,#bfdbfe_70%,#93c5fd_100%)] text-slate-900",
        amount: "text-sky-200",
        aura: "bg-sky-300/22",
      };
    }
    if (idx === 2) {
      return {
        badge: "border-orange-200/82 bg-[linear-gradient(135deg,#fed7aa_0%,#fdba74_68%,#fb923c_100%)] text-slate-950",
        amount: "text-orange-200",
        aura: "bg-orange-300/22",
      };
    }

    return {
      badge: "border-violet-100/45 bg-violet-300/18 text-violet-50",
      amount: "text-emerald-200",
      aura: "bg-violet-300/20",
    };
  };

  const chipGroupClass =
    "inline-flex rounded-full border border-violet-100/30 bg-violet-950/45 p-0.5";
  const activeChipClass =
    "inline-flex h-8 items-center whitespace-nowrap rounded-full border border-sky-200/30 bg-sky-300/18 px-2.5 font-semibold text-sky-50 shadow-[0_8px_20px_rgba(26,10,60,0.35)]";
  const idleChipClass =
    "inline-flex h-8 items-center whitespace-nowrap rounded-full border border-transparent px-2.5 font-semibold text-violet-100/65 transition hover:bg-white/[0.06] hover:text-violet-50";
  const productChipClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70";

  return (
    <section className={leaderboardClass} data-fixed-box-theme="slate">
      <div className="relative z-10 mb-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-3 text-2xl font-extrabold tracking-[-0.02em] text-violet-50 sm:text-[1.75rem]">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-100/40 bg-sky-300/15">
              <Trophy className="h-4.5 w-4.5 text-amber-300" strokeWidth={2.1} aria-hidden="true" />
            </span>
            <span>{copy.title}</span>
          </h2>
        </div>

        <div className="mt-3 flex flex-nowrap items-center justify-end gap-2 text-[10px] md:absolute md:right-0 md:top-0 md:mt-0">
          <div className={`${chipGroupClass} gap-0.5`} role="group" aria-label="Typ produktu">
            <button
              type="button"
              onClick={() => onProductFilterChange("life")}
              className={`${productChipClass} ${
                lbProductFilter === "life"
                  ? "border-fuchsia-200/45 bg-fuchsia-300/22 text-fuchsia-100 shadow-[0_7px_18px_rgba(192,38,211,0.2)]"
                  : "border-transparent text-violet-100/60 hover:bg-white/[0.06] hover:text-violet-50"
              }`}
              aria-label={copy.life}
              aria-pressed={lbProductFilter === "life"}
              title={copy.life}
            >
              <HeartPulse className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onProductFilterChange("other")}
              className={`${productChipClass} ${
                lbProductFilter === "other"
                  ? "border-sky-200/45 bg-sky-300/22 text-sky-100 shadow-[0_7px_18px_rgba(14,165,233,0.2)]"
                  : "border-transparent text-violet-100/60 hover:bg-white/[0.06] hover:text-violet-50"
              }`}
              aria-label={copy.other}
              aria-pressed={lbProductFilter === "other"}
              title={copy.other}
            >
              <Layers3 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          <div className={chipGroupClass} role="group" aria-label="Období žebříčku">
            <button
              type="button"
              onClick={() => onRangeChange("month")}
              className={lbRange === "month" ? activeChipClass : idleChipClass}
            >
              {copy.month}
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("sixMonths")}
              className={lbRange === "sixMonths" ? activeChipClass : idleChipClass}
            >
              {copy.sixMonths}
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("year")}
              className={lbRange === "year" ? activeChipClass : idleChipClass}
            >
              {copy.year}
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
            <span>{copy.loading}</span>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="relative z-10 rounded-2xl border border-dashed border-violet-100/32 bg-violet-950/28 px-4 py-7 text-center">
          <p className="text-sm text-violet-100/78">
            {copy.empty}
          </p>
        </div>
      ) : (
        <ol className="relative z-10 space-y-2.5">
          {visibleEntries.map((row, idx) => {
            const accents = getRankAccent(idx);

            return (
              <li
                key={row.email}
                className="group relative overflow-hidden rounded-[22px] border border-violet-100/30 bg-[radial-gradient(circle_at_12%_0%,rgba(167,139,250,0.2),transparent_48%),linear-gradient(160deg,#2d1357_0%,#1b0b40_58%,#100726_100%)] px-4 py-3 shadow-[0_10px_24px_rgba(11,3,33,0.32)] sm:px-5 sm:py-3.5"
              >
                <span className={`pointer-events-none absolute -left-10 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full blur-3xl ${accents.aura}`} />
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(128deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0)_40%)]" />

                <div className="relative flex items-center justify-between gap-3 sm:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${accents.badge}`}
                      >
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xl font-semibold leading-tight text-violet-50 sm:text-[1.55rem]">
                          {row.name}
                        </div>
                        <span className="mt-0.5 block text-[10px] text-violet-100/68 sm:text-[11px]">
                          {leaderboardLabel}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[9px] uppercase tracking-[0.14em] text-violet-100/58 sm:text-[10px]">{copy.premium}</div>
                      <div className={`whitespace-nowrap text-[1.65rem] font-semibold leading-none sm:text-[2rem] ${accents.amount}`}>
                        <AnimatedMoney value={row.totalPremium} />
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
