import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Minus,
  Tag,
  UserRound,
  UsersRound,
} from "lucide-react";
import { AnimatedMoney, AnimatedNumber } from "./AnimatedNumbers";

type Props = {
  loading: boolean;
  showTeamBox: boolean;
  myContractsCount: number;
  myImmediateSum: number;
  myImmediatePrevSum: number;
  myTipContractsCount: number;
  myTipImmediateSum: number;
  myTipImmediatePrevSum: number;
  teamContractsCount: number;
  teamImmediateSum: number;
  teamImmediatePrevSum: number;
  totalContractsCount: number;
  totalWithTeam: number;
  totalPrevWithTeam: number;
  isLiteUI: boolean;
};

function LoadingIndicator() {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-slate-300">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-sky-200"
        aria-hidden="true"
      />
      <span>Načítám…</span>
    </div>
  );
}

function buildTrend(currentValue: number, previousValue: number): {
  direction: "up" | "down" | "flat";
  label: string;
} {
  const current = Number.isFinite(currentValue) ? currentValue : 0;
  const previous = Number.isFinite(previousValue) ? previousValue : 0;
  if (previous === 0) {
    if (current === 0) {
      return { direction: "flat", label: "0,0 %" };
    }
    return { direction: current > 0 ? "up" : "down", label: current > 0 ? "+∞ %" : "-∞ %" };
  }

  const rawPct = ((current - previous) / Math.abs(previous)) * 100;
  const pct = Math.abs(rawPct) < 0.05 ? 0 : rawPct;
  const absFormatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(pct));
  const prefix = pct > 0 ? "+" : pct < 0 ? "-" : "";
  return {
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
    label: `${prefix}${absFormatted} %`,
  };
}

function TrendInline({
  currentValue,
  previousValue,
}: {
  currentValue: number;
  previousValue: number;
}) {
  const trend = buildTrend(currentValue, previousValue);
  const trendClass =
    trend.direction === "up"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
      : trend.direction === "down"
        ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
        : "border-slate-500/40 bg-slate-500/10 text-slate-200";
  const ArrowIcon =
    trend.direction === "up"
      ? ArrowUpRight
      : trend.direction === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <div className="mt-1.5 flex items-center justify-center">
      <div
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${trendClass}`}
      >
        <ArrowIcon className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden="true" />
        <span>{trend.label}</span>
        <span className="text-slate-400">vs. minulý měsíc</span>
      </div>
    </div>
  );
}

function ShortDividerLines({
  columns,
  visibilityClass,
}: {
  columns: 2 | 3 | 4;
  visibilityClass: "md:block" | "lg:block";
}) {
  const positions =
    columns === 2
      ? ["50%"]
      : columns === 3
        ? ["33.3333%", "66.6667%"]
        : ["25%", "50%", "75%"];

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 hidden ${visibilityClass}`}
      aria-hidden="true"
    >
      {positions.map((left) => (
        <div key={left} className="absolute top-1/2 -translate-y-1/2" style={{ left }}>
          <div className="h-[66%] w-px bg-gradient-to-b from-transparent via-slate-300/45 to-transparent" />
          <div className="absolute left-0 top-1/2 h-[46%] w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-sky-200/20 to-transparent blur-[0.6px]" />
        </div>
      ))}
    </div>
  );
}

export function ProductionSummarySection({
  loading,
  showTeamBox,
  myContractsCount,
  myImmediateSum,
  myImmediatePrevSum,
  myTipContractsCount,
  myTipImmediateSum,
  myTipImmediatePrevSum,
  teamContractsCount,
  teamImmediateSum,
  teamImmediatePrevSum,
  totalContractsCount,
  totalWithTeam,
  totalPrevWithTeam,
  isLiteUI,
}: Props) {
  const summaryCardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 py-3 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-600 focus-within:border-slate-600 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.22)] sm:px-7 sm:py-4"
    : "relative h-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 py-3 text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] transition-[border-color,box-shadow] duration-200 hover:border-slate-600 hover:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-600 focus-within:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.2)] sm:px-7 sm:py-4";
  const compactSummaryCardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-1.5 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-600 focus-within:border-slate-600 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.22)] sm:px-6 sm:py-2"
    : "relative h-full overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-1.5 text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] transition-[border-color,box-shadow] duration-200 hover:border-slate-600 hover:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-600 focus-within:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.2)] sm:px-6 sm:py-2";

  if (!showTeamBox) {
    const hasTipIncome = myTipImmediateSum > 0;
    return (
      <section className={compactSummaryCardClass} data-fixed-box-theme="slate">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_46%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_100%,rgba(34,211,238,0.12),transparent_40%)]" />

        <div
          className={`relative z-10 ${
            hasTipIncome
              ? "grid min-h-[144px] items-stretch gap-2 md:grid-cols-2 md:gap-3"
              : "flex min-h-[128px] flex-col items-center justify-center gap-1.5 text-center sm:min-h-[140px]"
          }`}
        >
          {hasTipIncome ? (
            <ShortDividerLines columns={2} visibilityClass="md:block" />
          ) : null}
          <div className="grid min-h-[128px] content-center justify-items-center gap-y-1.5 px-3 text-center sm:min-h-[140px] md:px-6">
            <h2 className="flex min-h-[40px] items-center text-2xl font-semibold text-white sm:min-h-[48px] sm:text-3xl">
              <span className="inline-flex items-center gap-2.5">
                <UserRound
                  className="h-7 w-7 text-sky-300"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className="md:whitespace-nowrap">Vlastní produkce</span>
              </span>
            </h2>
            {loading ? (
              <LoadingIndicator />
            ) : (
              <>
                <dl className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Počet smluv
                  </dt>
                  <dd className="text-3xl font-semibold text-sky-300 sm:text-4xl">
                    <AnimatedNumber value={myContractsCount} />
                  </dd>
                </dl>
                <dl className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Provize
                  </dt>
                  <dd className="whitespace-nowrap text-4xl font-semibold text-sky-200 sm:text-5xl">
                    <AnimatedMoney value={myImmediateSum} />
                  </dd>
                </dl>
                <TrendInline
                  currentValue={myImmediateSum}
                  previousValue={myImmediatePrevSum}
                />
              </>
            )}
          </div>

          {hasTipIncome && (
            <div className="grid min-h-[128px] content-center justify-items-center gap-y-1.5 px-3 text-center sm:min-h-[140px] md:px-6">
              <h2 className="flex min-h-[40px] items-center text-2xl font-semibold text-white sm:min-h-[48px] sm:text-3xl">
                <span className="inline-flex items-center gap-2.5">
                  <Tag
                    className="h-7 w-7 text-fuchsia-300"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="md:whitespace-nowrap">Tipař</span>
                </span>
              </h2>
              {loading ? (
                <LoadingIndicator />
              ) : (
                <>
                <dl className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Počet tipů
                  </dt>
                  <dd className="text-3xl font-semibold text-fuchsia-300 sm:text-4xl">
                    <AnimatedNumber value={myTipContractsCount} />
                  </dd>
                </dl>
                <dl className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Provize
                  </dt>
                  <dd className="whitespace-nowrap text-4xl font-semibold text-fuchsia-200 sm:text-5xl">
                    <AnimatedMoney value={myTipImmediateSum} />
                  </dd>
                </dl>
                <TrendInline
                  currentValue={myTipImmediateSum}
                  previousValue={myTipImmediatePrevSum}
                />
              </>
            )}
            </div>
          )}
        </div>
      </section>
    );
  }

  const hasManagerTipIncome = myTipImmediateSum > 0;
  const managerTitleClass = hasManagerTipIncome
    ? "text-lg font-semibold text-white sm:text-xl"
    : "text-lg font-semibold text-white sm:text-[1.35rem]";
  const managerCountClass = hasManagerTipIncome
    ? "mt-1.5 text-xl font-semibold sm:text-2xl"
    : "mt-1.5 text-2xl font-semibold sm:text-3xl";
  const managerAmountClass = hasManagerTipIncome
    ? "mt-1.5 whitespace-nowrap text-3xl font-semibold sm:text-4xl"
    : "mt-1.5 whitespace-nowrap text-[2.05rem] font-semibold sm:text-[2.55rem]";
  const managerDividerColumns: 3 | 4 = hasManagerTipIncome ? 4 : 3;
  const managerDividerVisibility: "md:block" | "lg:block" = hasManagerTipIncome
    ? "lg:block"
    : "md:block";

  return (
    <section className={summaryCardClass} data-fixed-box-theme="slate">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_46%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_100%,rgba(34,211,238,0.12),transparent_40%)]" />

      <div
        className={`relative z-10 grid h-full items-stretch gap-2 md:gap-3 ${
          hasManagerTipIncome ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"
        }`}
      >
        <ShortDividerLines
          columns={managerDividerColumns}
          visibilityClass={managerDividerVisibility}
        />
        <div className="flex min-h-[134px] h-full flex-col justify-center space-y-1.5 text-center md:px-5">
          <div className="space-y-1.5">
              <div className="mx-auto flex h-6 w-6 items-center justify-center">
                <UserRound className="h-6 w-6 text-sky-300" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Vlastní</span>
                <span className="block">produkce</span>
              </h2>
            </div>
          {loading ? (
            <LoadingIndicator />
          ) : (
            <dl className="space-y-1.5">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className={`${managerCountClass} text-sky-200`}>
                  <AnimatedNumber value={myContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className={`${managerAmountClass} text-sky-200`}>
                  <AnimatedMoney value={myImmediateSum} />
                </dd>
                <TrendInline
                  currentValue={myImmediateSum}
                  previousValue={myImmediatePrevSum}
                />
              </div>
            </dl>
          )}
        </div>

        <div className="flex min-h-[134px] h-full flex-col justify-center space-y-1.5 text-center md:px-5">
          <div className="space-y-1.5">
              <div className="mx-auto flex h-6 w-6 items-center justify-center">
                <UsersRound className="h-6 w-6 text-amber-300" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Týmová</span>
                <span className="block">produkce</span>
              </h2>
            </div>
          {loading ? (
            <LoadingIndicator />
          ) : (
            <dl className="space-y-1.5">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className={`${managerCountClass} text-amber-200`}>
                  <AnimatedNumber value={teamContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className={`${managerAmountClass} text-amber-200`}>
                  <AnimatedMoney value={teamImmediateSum} />
                </dd>
                <TrendInline
                  currentValue={teamImmediateSum}
                  previousValue={teamImmediatePrevSum}
                />
              </div>
            </dl>
          )}
        </div>

        {hasManagerTipIncome && (
          <div className="flex min-h-[134px] h-full flex-col justify-center space-y-1.5 text-center md:px-5">
            <div className="space-y-1.5">
              <div className="mx-auto flex h-6 w-6 items-center justify-center">
                <Tag className="h-6 w-6 text-fuchsia-300" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Tipařská</span>
                <span className="block">produkce</span>
              </h2>
            </div>
            {loading ? (
              <LoadingIndicator />
            ) : (
              <dl className="space-y-1.5">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Počet tipů
                  </dt>
                  <dd className={`${managerCountClass} text-fuchsia-200`}>
                    <AnimatedNumber value={myTipContractsCount} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Provize
                  </dt>
                  <dd className={`${managerAmountClass} text-fuchsia-200`}>
                    <AnimatedMoney value={myTipImmediateSum} />
                  </dd>
                  <TrendInline
                    currentValue={myTipImmediateSum}
                    previousValue={myTipImmediatePrevSum}
                  />
                </div>
              </dl>
            )}
          </div>
        )}

        <div className="flex min-h-[134px] h-full flex-col justify-center space-y-1.5 text-center md:px-5">
          <div className="space-y-1.5">
              <div className="mx-auto flex h-6 w-6 items-center justify-center">
                <BarChart3 className="h-6 w-6 text-emerald-300" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Celková</span>
                <span className="block">produkce</span>
              </h2>
            </div>
          {loading ? (
            <LoadingIndicator />
          ) : (
            <dl className="space-y-1.5">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className={`${managerCountClass} text-emerald-400`}>
                  <AnimatedNumber value={totalContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className={`${managerAmountClass} text-emerald-400`}>
                  <AnimatedMoney value={totalWithTeam} />
                </dd>
                <TrendInline
                  currentValue={totalWithTeam}
                  previousValue={totalPrevWithTeam}
                />
              </div>
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}
