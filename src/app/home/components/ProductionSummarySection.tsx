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
import { REVENUE_SCOPE_THEME } from "@/app/lib/revenueScopeTheme";

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
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:text-[11px] ${trendClass}`}
      >
        <ArrowIcon className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden="true" />
        <span>{trend.label}</span>
        <span className="text-slate-400 sm:hidden">vs. min. měsíc</span>
        <span className="hidden text-slate-400 sm:inline">vs. minulý měsíc</span>
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

function ProductionTopPanel() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[22px] rounded-t-[26px] border-b border-slate-700/65 bg-[linear-gradient(180deg,#07122a_0%,#08142b_62%,#09162b_100%)]">
      <div className="flex h-full items-center gap-1.5 px-3 sm:px-4">
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-400/95 shadow-[0_0_0_1px_rgba(248,113,113,0.18)]" />
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400/95 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]" />
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400/95 shadow-[0_0_0_1px_rgba(74,222,128,0.2)]" />
        <span className="ml-1.5 inline-flex items-center rounded-md border border-slate-600/60 bg-slate-700/30 px-2 py-[1px] text-[9px] font-medium tracking-[0.08em] text-slate-300 sm:text-[10px]">
          Bohemka.App export preview
        </span>
      </div>
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
    ? "relative h-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 pb-3 pt-8 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-600 focus-within:border-slate-600 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.22)] sm:px-7 sm:pb-4 sm:pt-9"
    : "relative h-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 pb-3 pt-8 text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] transition-[border-color,box-shadow] duration-200 hover:border-slate-600 hover:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-600 focus-within:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.2)] sm:px-7 sm:pb-4 sm:pt-9";
  const compactSummaryCardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-4 pb-1.5 pt-8 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-600 focus-within:border-slate-600 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.22)] sm:px-6 sm:pb-2 sm:pt-8"
    : "relative h-full overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-4 pb-1.5 pt-8 text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] transition-[border-color,box-shadow] duration-200 hover:border-slate-600 hover:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-600 focus-within:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.2)] sm:px-6 sm:pb-2 sm:pt-8";

  if (!showTeamBox) {
    const hasTipIncome = myTipImmediateSum > 0;
    return (
      <section className={compactSummaryCardClass} data-fixed-box-theme="slate">
        <ProductionTopPanel />
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
            <h2
              className={`flex min-h-[40px] items-center text-2xl font-semibold sm:min-h-[48px] sm:text-3xl ${REVENUE_SCOPE_THEME.own.headingClass}`}
            >
              <span className="inline-flex items-center gap-2.5">
                <UserRound
                  className={`h-7 w-7 ${REVENUE_SCOPE_THEME.own.iconClass}`}
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
                  <dd className={`text-3xl font-semibold sm:text-4xl ${REVENUE_SCOPE_THEME.own.valueClass}`}>
                    <AnimatedNumber value={myContractsCount} />
                  </dd>
                </dl>
                <dl className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Provize
                  </dt>
                  <dd className={`whitespace-nowrap text-4xl font-semibold sm:text-5xl ${REVENUE_SCOPE_THEME.own.valueClass}`}>
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
              <h2
                className={`flex min-h-[40px] items-center text-2xl font-semibold sm:min-h-[48px] sm:text-3xl ${REVENUE_SCOPE_THEME.tip.headingClass}`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Tag
                    className={`h-7 w-7 ${REVENUE_SCOPE_THEME.tip.iconClass}`}
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
                  <dd className={`text-3xl font-semibold sm:text-4xl ${REVENUE_SCOPE_THEME.tip.valueClass}`}>
                    <AnimatedNumber value={myTipContractsCount} />
                  </dd>
                </dl>
                <dl className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Provize
                  </dt>
                  <dd className={`whitespace-nowrap text-4xl font-semibold sm:text-5xl ${REVENUE_SCOPE_THEME.tip.valueClass}`}>
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
    ? "text-base font-semibold text-white sm:text-xl"
    : "text-[1.05rem] font-semibold text-white sm:text-[1.35rem]";
  const managerCountClass = hasManagerTipIncome
    ? "mt-1 text-lg font-semibold sm:mt-1.5 sm:text-2xl"
    : "mt-1 text-[1.35rem] font-semibold sm:mt-1.5 sm:text-3xl";
  const managerAmountClass = hasManagerTipIncome
    ? "mt-1 whitespace-nowrap text-[1.75rem] font-semibold sm:mt-1.5 sm:text-4xl"
    : "mt-1 whitespace-nowrap text-[1.9rem] font-semibold sm:mt-1.5 sm:text-[2.55rem]";
  const managerDividerColumns: 3 | 4 = hasManagerTipIncome ? 4 : 3;
  const managerDividerVisibility: "md:block" | "lg:block" = hasManagerTipIncome
    ? "lg:block"
    : "md:block";

  return (
    <section className={summaryCardClass} data-fixed-box-theme="slate">
      <ProductionTopPanel />
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
        <div className="flex min-h-[118px] h-full flex-col justify-center space-y-1 text-center md:min-h-[134px] md:space-y-1.5 md:px-5">
          <div className="space-y-1">
              <div className="mx-auto flex h-5 w-5 items-center justify-center md:h-6 md:w-6">
                <UserRound
                  className={`h-5 w-5 md:h-6 md:w-6 ${REVENUE_SCOPE_THEME.own.iconClass}`}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              </div>
              <h2 className={managerTitleClass}>
                <span className={`block ${REVENUE_SCOPE_THEME.own.headingClass}`}>Vlastní</span>
                <span className={`block ${REVENUE_SCOPE_THEME.own.headingClass}`}>produkce</span>
              </h2>
            </div>
          {loading ? (
            <LoadingIndicator />
          ) : (
            <dl className="space-y-1">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className={`${managerCountClass} ${REVENUE_SCOPE_THEME.own.valueClass}`}>
                  <AnimatedNumber value={myContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className={`${managerAmountClass} ${REVENUE_SCOPE_THEME.own.valueClass}`}>
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

        <div className="flex min-h-[118px] h-full flex-col justify-center space-y-1 text-center md:min-h-[134px] md:space-y-1.5 md:px-5">
          <div className="space-y-1">
              <div className="mx-auto flex h-5 w-5 items-center justify-center md:h-6 md:w-6">
                <UsersRound
                  className={`h-5 w-5 md:h-6 md:w-6 ${REVENUE_SCOPE_THEME.team.iconClass}`}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              </div>
              <h2 className={managerTitleClass}>
                <span className={`block ${REVENUE_SCOPE_THEME.team.headingClass}`}>Týmová</span>
                <span className={`block ${REVENUE_SCOPE_THEME.team.headingClass}`}>produkce</span>
              </h2>
            </div>
          {loading ? (
            <LoadingIndicator />
          ) : (
            <dl className="space-y-1">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Počet smluv
                </dt>
                <dd className={`${managerCountClass} ${REVENUE_SCOPE_THEME.team.valueClass}`}>
                  <AnimatedNumber value={teamContractsCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Provize
                </dt>
                <dd className={`${managerAmountClass} ${REVENUE_SCOPE_THEME.team.valueClass}`}>
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
          <div className="flex min-h-[118px] h-full flex-col justify-center space-y-1 text-center md:min-h-[134px] md:space-y-1.5 md:px-5">
            <div className="space-y-1">
              <div className="mx-auto flex h-5 w-5 items-center justify-center md:h-6 md:w-6">
                <Tag
                  className={`h-5 w-5 md:h-6 md:w-6 ${REVENUE_SCOPE_THEME.tip.iconClass}`}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              </div>
              <h2 className={managerTitleClass}>
                <span className={`block ${REVENUE_SCOPE_THEME.tip.headingClass}`}>Tipařská</span>
                <span className={`block ${REVENUE_SCOPE_THEME.tip.headingClass}`}>produkce</span>
              </h2>
            </div>
            {loading ? (
              <LoadingIndicator />
            ) : (
              <dl className="space-y-1">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Počet tipů
                  </dt>
                  <dd className={`${managerCountClass} ${REVENUE_SCOPE_THEME.tip.valueClass}`}>
                    <AnimatedNumber value={myTipContractsCount} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Provize
                  </dt>
                  <dd className={`${managerAmountClass} ${REVENUE_SCOPE_THEME.tip.valueClass}`}>
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

        <div className="flex min-h-[118px] h-full flex-col justify-center space-y-1 text-center md:min-h-[134px] md:space-y-1.5 md:px-5">
          <div className="space-y-1">
              <div className="mx-auto flex h-5 w-5 items-center justify-center md:h-6 md:w-6">
                <BarChart3 className="h-5 w-5 text-emerald-300 md:h-6 md:w-6" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h2 className={managerTitleClass}>
                <span className="block">Celková</span>
                <span className="block">produkce</span>
              </h2>
            </div>
          {loading ? (
            <LoadingIndicator />
          ) : (
            <dl className="space-y-1">
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
