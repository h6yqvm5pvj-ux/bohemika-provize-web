import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Minus,
  Tag,
  UserRound,
  UsersRound,
  type LucideIcon,
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

type ProductionTone = "own" | "team" | "tip" | "total";

type ProductionToneTheme = {
  iconClass: string;
  headingClass: string;
  amountClass: string;
  countClass: string;
  arrowClass: string;
};

const PRODUCTION_THEME: Record<ProductionTone, ProductionToneTheme> = {
  own: {
    iconClass: "text-emerald-200",
    headingClass: "text-violet-50",
    amountClass: "text-violet-100",
    countClass: "text-emerald-200",
    arrowClass: "text-emerald-200/90",
  },
  team: {
    iconClass: "text-indigo-200",
    headingClass: "text-violet-50",
    amountClass: "text-violet-100",
    countClass: "text-indigo-200",
    arrowClass: "text-indigo-200/90",
  },
  tip: {
    iconClass: "text-fuchsia-200",
    headingClass: "text-violet-50",
    amountClass: "text-violet-100",
    countClass: "text-fuchsia-200",
    arrowClass: "text-fuchsia-200/90",
  },
  total: {
    iconClass: "text-emerald-200",
    headingClass: "text-violet-50",
    amountClass: "text-emerald-200",
    countClass: "text-emerald-200",
    arrowClass: "text-emerald-200/90",
  },
};

function ProductionLoadingPanel({
  progress,
  stage,
}: {
  progress: number;
  stage: string;
}) {
  const safeProgress = Math.max(8, Math.min(97, progress));

  return (
    <div className="relative w-full overflow-hidden rounded-[24px] border border-violet-100/30 bg-violet-950/24 px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-violet-50">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-violet-100/40 border-t-violet-100"
              aria-hidden="true"
            />
            Načítám data produkce
          </div>
          <div className="mt-2 text-sm text-violet-100/80">{stage}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-violet-100/75">
            {safeProgress}% připraveno
          </div>
        </div>

        <div className="relative h-16 w-16 shrink-0">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from -90deg, rgba(221,214,254,1) 0deg ${safeProgress * 3.6}deg, rgba(196,181,253,0.24) ${safeProgress * 3.6}deg 360deg)`,
            }}
          />
          <div className="absolute inset-[5px] rounded-full bg-violet-950/92" />
          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-violet-100">
            {safeProgress}%
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-violet-100/20">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-300 via-fuchsia-300 to-indigo-200 transition-[width] duration-300 ease-out"
          style={{ width: `${safeProgress}%` }}
        />
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-2 w-[78%] animate-pulse rounded-full bg-violet-100/30" />
        <div className="h-2 w-[66%] animate-pulse rounded-full bg-violet-100/24" style={{ animationDelay: "120ms" }} />
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
      ? "border-emerald-300/45 bg-emerald-300/14 text-emerald-100"
      : trend.direction === "down"
        ? "border-rose-300/45 bg-rose-300/14 text-rose-100"
        : "border-violet-200/45 bg-violet-200/14 text-violet-100";
  const ArrowIcon =
    trend.direction === "up"
      ? ArrowUpRight
      : trend.direction === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-[11px] ${trendClass}`}
    >
      <ArrowIcon className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden="true" />
      <span>{trend.label}</span>
      <span className="hidden text-violet-100/60 sm:inline">vs. min. měsíc</span>
    </div>
  );
}

function ShortDividerLines({
  columns,
  visibilityClass,
}: {
  columns: 2 | 3 | 4;
  visibilityClass: string;
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
          <div className="h-[72%] w-px bg-gradient-to-b from-transparent via-violet-100/38 to-transparent" />
          <div className="absolute left-0 top-1/2 h-[48%] w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-fuchsia-200/20 to-transparent blur-[0.5px]" />
        </div>
      ))}
    </div>
  );
}

type ProductionColumnProps = {
  tone: ProductionTone;
  titleTop: string;
  titleBottom: string;
  description: string;
  icon: LucideIcon;
  countLabel: string;
  countValue: number;
  amountValue: number;
  previousAmountValue: number;
};

function ProductionColumn({
  tone,
  titleTop,
  titleBottom,
  description,
  icon: Icon,
  countLabel,
  countValue,
  amountValue,
  previousAmountValue,
}: ProductionColumnProps) {
  const theme = PRODUCTION_THEME[tone];

  return (
    <article className="relative flex h-full min-h-[182px] flex-col px-3 py-2 text-left sm:min-h-[198px] sm:px-5 sm:py-3">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-100/48 bg-violet-300/18">
        <Icon className={`h-4.5 w-4.5 ${theme.iconClass}`} strokeWidth={2.25} aria-hidden="true" />
      </div>

      <h2 className={`mt-3 text-[1.65rem] font-extrabold leading-[1.03] tracking-[-0.02em] sm:text-[2rem] ${theme.headingClass}`}>
        <span className="block">{titleTop}</span>
        <span className="block">{titleBottom}</span>
      </h2>

      <p className="mt-2 text-sm leading-5 text-violet-100/72">{description}</p>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/70">Provize</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={`whitespace-nowrap text-[2rem] font-black leading-none tracking-[-0.03em] sm:text-[2.45rem] ${theme.amountClass}`}>
          <AnimatedMoney value={amountValue} />
        </p>
        <ArrowUpRight className={`h-8 w-8 shrink-0 ${theme.arrowClass}`} strokeWidth={2.2} aria-hidden="true" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-violet-100/70">{countLabel}</p>
          <p className={`mt-1 text-[2rem] font-bold leading-none tracking-[-0.01em] sm:text-[2.2rem] ${theme.countClass}`}>
            <AnimatedNumber value={countValue} />
          </p>
        </div>
        <TrendInline currentValue={amountValue} previousValue={previousAmountValue} />
      </div>
    </article>
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
      const target = Math.round(14 + eased * 81);
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

  const containerShellClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[30px] border border-violet-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(168,85,247,0.26),transparent_42%),linear-gradient(165deg,#261048_0%,#160934_58%,#0d0521_100%)] px-3 py-3 text-white transition-[border-color,box-shadow] duration-200 hover:border-violet-200/60 focus-within:border-violet-200/60 focus-within:shadow-[0_0_0_1px_rgba(221,214,254,0.3)] sm:px-4 sm:py-4"
    : "relative h-full overflow-hidden rounded-[30px] border border-violet-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(168,85,247,0.26),transparent_42%),linear-gradient(165deg,#261048_0%,#160934_58%,#0d0521_100%)] px-3 py-3 text-white shadow-[0_20px_44px_rgba(11,3,33,0.5)] transition-[border-color,box-shadow] duration-200 hover:border-violet-200/60 hover:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(221,214,254,0.24)] focus-within:border-violet-200/60 focus-within:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(221,214,254,0.3)] sm:px-4 sm:py-4";
  const hasTipIncome = myTipImmediateSum > 0;
  const hasManagerTipIncome = myTipImmediateSum > 0;

  if (loading) {
    return (
      <section className={containerShellClass} data-fixed-box-theme="slate">
        <div className="relative z-10 flex h-full items-center">
          <ProductionLoadingPanel progress={clampedLoadingProgress} stage={loadingStage} />
        </div>
      </section>
    );
  }

  if (!showTeamBox) {
    return (
      <section className={containerShellClass} data-fixed-box-theme="slate">
        <div className={`relative z-10 grid gap-3 ${hasTipIncome ? "md:grid-cols-2" : ""}`}>
          {hasTipIncome ? <ShortDividerLines columns={2} visibilityClass="md:block" /> : null}
          <ProductionColumn
            tone="own"
            titleTop="Vlastní"
            titleBottom="produkce"
            description="Aktuální osobní výkon za vybrané období."
            icon={UserRound}
            countLabel="Počet smluv"
            countValue={myContractsCount}
            amountValue={myImmediateSum}
            previousAmountValue={myImmediatePrevSum}
          />

          {hasTipIncome ? (
            <ProductionColumn
              tone="tip"
              titleTop="Tipařská"
              titleBottom="produkce"
              description="Provize ze smluv vedených jako tipařské."
              icon={Tag}
              countLabel="Počet tipů"
              countValue={myTipContractsCount}
              amountValue={myTipImmediateSum}
              previousAmountValue={myTipImmediatePrevSum}
            />
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className={containerShellClass} data-fixed-box-theme="slate">
      <div
        className={`relative z-10 grid gap-3 ${
          hasManagerTipIncome ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"
        }`}
      >
        {hasManagerTipIncome ? (
          <>
            <ShortDividerLines columns={2} visibilityClass="md:block xl:hidden" />
            <ShortDividerLines columns={4} visibilityClass="xl:block" />
          </>
        ) : (
          <ShortDividerLines columns={3} visibilityClass="md:block" />
        )}

        <ProductionColumn
          tone="own"
          titleTop="Vlastní"
          titleBottom="produkce"
          description="Aktuální osobní výkon za vybrané období."
          icon={UserRound}
          countLabel="Počet smluv"
          countValue={myContractsCount}
          amountValue={myImmediateSum}
          previousAmountValue={myImmediatePrevSum}
        />

        <ProductionColumn
          tone="team"
          titleTop="Týmová"
          titleBottom="produkce"
          description="Součet produkce podřízené týmové struktury."
          icon={UsersRound}
          countLabel="Počet smluv"
          countValue={teamContractsCount}
          amountValue={teamImmediateSum}
          previousAmountValue={teamImmediatePrevSum}
        />

        {hasManagerTipIncome ? (
          <ProductionColumn
            tone="tip"
            titleTop="Tipařská"
            titleBottom="produkce"
            description="Provize ze smluv vedených jako tipařské."
            icon={Tag}
            countLabel="Počet tipů"
            countValue={myTipContractsCount}
            amountValue={myTipImmediateSum}
            previousAmountValue={myTipImmediatePrevSum}
          />
        ) : null}

        <ProductionColumn
          tone="total"
          titleTop="Celková"
          titleBottom="produkce"
          description="Vlastní a týmová produkce v jednom součtu."
          icon={BarChart3}
          countLabel="Počet smluv"
          countValue={totalContractsCount}
          amountValue={totalWithTeam}
          previousAmountValue={totalPrevWithTeam}
        />
      </div>
    </section>
  );
}
