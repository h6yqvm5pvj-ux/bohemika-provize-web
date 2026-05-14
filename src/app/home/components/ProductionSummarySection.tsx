import { useEffect, useState } from "react";
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

function ProductionLoadingPanel({
  progress,
  stage,
  metricLabels,
}: {
  progress: number;
  stage: string;
  metricLabels: string[];
}) {
  const safeProgress = Math.max(8, Math.min(97, progress));
  const metricGridClass =
    metricLabels.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : metricLabels.length === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-slate-800/95 bg-[linear-gradient(122deg,#000b26_0%,#000722_46%,#062232_100%)] px-4 py-4 shadow-[0_18px_34px_rgba(2,6,23,0.34)] sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl" />
      <div className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-cyan-300/16 blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-100">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-emerald-300"
                aria-hidden="true"
              />
              Načítám data produkce
            </div>
            <div className="mt-2 text-sm text-slate-300">{stage}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-emerald-200">
              {safeProgress}% připraveno
            </div>
          </div>

          <div className="relative h-16 w-16 shrink-0">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from -90deg, rgba(16,185,129,1) 0deg ${safeProgress * 3.6}deg, rgba(148,163,184,0.25) ${safeProgress * 3.6}deg 360deg)`,
              }}
            />
            <div className="absolute inset-[5px] rounded-full bg-slate-950" />
            <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-emerald-200">
              {safeProgress}%
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-300 to-cyan-200 transition-[width] duration-300 ease-out"
            style={{ width: `${safeProgress}%` }}
          />
        </div>

        <div className={`mt-4 grid gap-2 ${metricGridClass}`}>
          {metricLabels.map((label, index) => {
            const isLast = index === metricLabels.length - 1;
            const isTeam = label === "Týmová produkce";
            const isTip = label === "Tipařská produkce";
            const cardClass = isLast
              ? "border-emerald-300/40 bg-emerald-300/12"
              : isTeam
                ? "border-indigo-300/40 bg-indigo-300/12"
                : isTip
                  ? "border-fuchsia-300/40 bg-fuchsia-300/12"
                  : "border-white/20 bg-white/8";
            const labelClass = isLast
              ? "text-emerald-200"
              : isTeam
                ? "text-indigo-200"
                : isTip
                  ? "text-fuchsia-200"
                  : "text-white/65";
            const pulseClass = isLast
              ? "bg-emerald-200/35"
              : isTeam
                ? "bg-indigo-200/35"
                : isTip
                  ? "bg-fuchsia-200/35"
                  : "bg-white/20";

            return (
              <div key={label} className={`rounded-xl border px-3 py-2 ${cardClass}`}>
                <div className={`text-[10px] uppercase tracking-[0.14em] ${labelClass}`}>{label}</div>
                <div className={`mt-2 h-4 w-24 animate-pulse rounded ${pulseClass}`} style={{ animationDelay: `${index * 110}ms` }} />
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-2">
          <div className="h-2 w-[78%] animate-pulse rounded-full bg-white/20" />
          <div className="h-2 w-[62%] animate-pulse rounded-full bg-white/15" style={{ animationDelay: "110ms" }} />
          <div className="h-2 w-[70%] animate-pulse rounded-full bg-white/15" style={{ animationDelay: "220ms" }} />
        </div>
      </div>
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
  const [loadingProgress, setLoadingProgress] = useState(14);
  const clampedLoadingProgress = Math.max(8, Math.min(97, loadingProgress));

  useEffect(() => {
    if (!loading) {
      const resetFrame = window.requestAnimationFrame(() => setLoadingProgress(14));
      return () => window.cancelAnimationFrame(resetFrame);
    }

    const startedAt = performance.now();
    let frame = 0;

    const animate = () => {
      const elapsed = performance.now() - startedAt;
      const phase = Math.min(1, elapsed / 3200);
      const eased = 1 - Math.pow(1 - phase, 2.2);
      const target = Math.round(14 + eased * 81); // držíme max ~95 %, finále až po datech
      setLoadingProgress((prev) => (target > prev ? target : prev));
      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  const loadingStage =
    clampedLoadingProgress < 35
      ? "Sbírám smlouvy a výkon…"
      : clampedLoadingProgress < 72
        ? "Počítám vlastní, týmovou a tipařskou produkci…"
        : "Finalizuji součty a trendy…";

  const summaryCardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 pb-3 pt-8 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-600 focus-within:border-slate-600 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.22)] sm:px-7 sm:pb-4 sm:pt-9"
    : "relative h-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 px-5 pb-3 pt-8 text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] transition-[border-color,box-shadow] duration-200 hover:border-slate-600 hover:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-600 focus-within:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.2)] sm:px-7 sm:pb-4 sm:pt-9";
  const compactSummaryCardClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-4 pb-1.5 pt-8 text-white transition-[border-color,box-shadow] duration-200 hover:border-slate-600 focus-within:border-slate-600 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.22)] sm:px-6 sm:pb-2 sm:pt-8"
    : "relative h-full overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-4 pb-1.5 pt-8 text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] transition-[border-color,box-shadow] duration-200 hover:border-slate-600 hover:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.18)] focus-within:border-slate-600 focus-within:shadow-[0_22px_42px_rgba(2,6,23,0.44),0_0_0_1px_rgba(148,163,184,0.2)] sm:px-6 sm:pb-2 sm:pt-8";
  const hasTipIncome = myTipImmediateSum > 0;
  const hasManagerTipIncome = myTipImmediateSum > 0;

  if (loading) {
    const loadingLabels = showTeamBox
      ? hasManagerTipIncome
        ? ["Vlastní produkce", "Týmová produkce", "Tipařská produkce", "Celková produkce"]
        : ["Vlastní produkce", "Týmová produkce", "Celková produkce"]
      : hasTipIncome
        ? ["Vlastní produkce", "Tipařská produkce"]
        : ["Vlastní produkce"];

    return (
      <section className={showTeamBox ? summaryCardClass : compactSummaryCardClass} data-fixed-box-theme="slate">
        <ProductionTopPanel />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_46%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_100%,rgba(34,211,238,0.12),transparent_40%)]" />

        <div className="relative z-10 flex h-full items-center py-1 sm:py-2">
          <ProductionLoadingPanel
            progress={clampedLoadingProgress}
            stage={loadingStage}
            metricLabels={loadingLabels}
          />
        </div>
      </section>
    );
  }

  if (!showTeamBox) {
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
            </div>
          )}
        </div>
      </section>
    );
  }

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
        </div>
      </div>
    </section>
  );
}
