import { type UIEvent, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Minus,
  Tag,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { type AppLanguage } from "@/lib/appLanguage";
import { HelpDialog } from "@/components/HelpDialog";
import { AnimatedMoney, AnimatedNumber } from "./AnimatedNumbers";
import { LoadingProgressPanel } from "./LoadingProgressPanel";

type Props = {
  language: AppLanguage;
  loading: boolean;
  showTeamBox: boolean;
  showOnlyTeamProduction?: boolean;
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

const PRODUCTION_SUMMARY_COPY: Record<
  AppLanguage,
  {
    previousMonth: string;
    commission: string;
    loadingTitle: string;
    loadingAccent: string;
    loadingStages: [string, string, string];
    swipeHint: string;
    cards: Record<
      ProductionTone,
      {
        titleTop: string;
        titleBottom: string;
        description: string;
        countLabel: string;
      }
    >;
  }
> = {
  cs: {
    previousMonth: "vs. min. měsíc",
    commission: "Provize",
    loadingTitle: "Načítám data produkce",
    loadingAccent: "Produkce",
    loadingStages: [
      "Sbírám smlouvy a výkon…",
      "Počítám vlastní, týmovou a tipařskou produkci…",
      "Finalizuji součty a trendy…",
    ],
    swipeHint: "Swipe do strany pro další produkci.",
    cards: {
      own: {
        titleTop: "Vlastní",
        titleBottom: "produkce",
        description: "Aktuální osobní výkon za vybrané období.",
        countLabel: "Počet smluv",
      },
      team: {
        titleTop: "Týmová",
        titleBottom: "produkce",
        description: "Součet produkce podřízené týmové struktury.",
        countLabel: "Počet smluv",
      },
      tip: {
        titleTop: "Tipařská",
        titleBottom: "produkce",
        description: "Provize ze smluv vedených jako tipařské.",
        countLabel: "Počet tipů",
      },
      total: {
        titleTop: "Celková",
        titleBottom: "produkce",
        description: "Vlastní a týmová produkce v jednom součtu.",
        countLabel: "Počet smluv",
      },
    },
  },
};

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
  previousMonthLabel,
}: {
  currentValue: number;
  previousValue: number;
  previousMonthLabel: string;
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
      <span className="hidden text-violet-100/60 sm:inline">{previousMonthLabel}</span>
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
  commissionLabel: string;
  previousMonthLabel: string;
  countValue: number;
  amountValue: number;
  previousAmountValue: number;
};

type ProductionCard = ProductionColumnProps & {
  id: string;
};

function ProductionColumn({
  tone,
  titleTop,
  titleBottom,
  description,
  icon: Icon,
  countLabel,
  commissionLabel,
  previousMonthLabel,
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

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/70">{commissionLabel}</p>
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
        <TrendInline
          currentValue={amountValue}
          previousValue={previousAmountValue}
          previousMonthLabel={previousMonthLabel}
        />
      </div>
    </article>
  );
}

export function ProductionSummarySection({
  language,
  loading,
  showTeamBox,
  showOnlyTeamProduction = false,
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
  const copy = PRODUCTION_SUMMARY_COPY[language];
  const [loadingProgress, setLoadingProgress] = useState(14);
  const [mobileCardIndex, setMobileCardIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
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

  const loadingStage = showOnlyTeamProduction
    ? "Počítám týmovou produkci…"
    : clampedLoadingProgress < 35
      ? copy.loadingStages[0]
      : clampedLoadingProgress < 72
        ? copy.loadingStages[1]
        : copy.loadingStages[2];

  const containerShellClass = isLiteUI
    ? "relative h-full overflow-hidden rounded-[30px] border border-violet-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(168,85,247,0.26),transparent_42%),linear-gradient(165deg,#261048_0%,#160934_58%,#0d0521_100%)] px-3 py-3 text-white transition-[border-color,box-shadow] duration-200 hover:border-violet-200/60 focus-within:border-violet-200/60 focus-within:shadow-[0_0_0_1px_rgba(221,214,254,0.3)] sm:px-4 sm:py-4"
    : "relative h-full overflow-hidden rounded-[30px] border border-violet-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(168,85,247,0.26),transparent_42%),linear-gradient(165deg,#261048_0%,#160934_58%,#0d0521_100%)] px-3 py-3 text-white shadow-[0_20px_44px_rgba(11,3,33,0.5)] transition-[border-color,box-shadow] duration-200 hover:border-violet-200/60 hover:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(221,214,254,0.24)] focus-within:border-violet-200/60 focus-within:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(221,214,254,0.3)] sm:px-4 sm:py-4";
  // Karta tipařské produkce má být viditelná už od první tipařské smlouvy,
  // i kdyby její provize byla zatím nulová.
  const hasTipContract = myTipContractsCount > 0;
  const ownCard: ProductionCard = {
    id: "own",
    tone: "own",
    titleTop: copy.cards.own.titleTop,
    titleBottom: copy.cards.own.titleBottom,
    description: copy.cards.own.description,
    icon: UserRound,
    countLabel: copy.cards.own.countLabel,
    commissionLabel: copy.commission,
    previousMonthLabel: copy.previousMonth,
    countValue: myContractsCount,
    amountValue: myImmediateSum,
    previousAmountValue: myImmediatePrevSum,
  };
  const teamCard: ProductionCard = {
    id: "team",
    tone: "team",
    titleTop: copy.cards.team.titleTop,
    titleBottom: copy.cards.team.titleBottom,
    description: copy.cards.team.description,
    icon: UsersRound,
    countLabel: copy.cards.team.countLabel,
    commissionLabel: copy.commission,
    previousMonthLabel: copy.previousMonth,
    countValue: teamContractsCount,
    amountValue: teamImmediateSum,
    previousAmountValue: teamImmediatePrevSum,
  };
  const tipCard: ProductionCard = {
    id: "tip",
    tone: "tip",
    titleTop: copy.cards.tip.titleTop,
    titleBottom: copy.cards.tip.titleBottom,
    description: copy.cards.tip.description,
    icon: Tag,
    countLabel: copy.cards.tip.countLabel,
    commissionLabel: copy.commission,
    previousMonthLabel: copy.previousMonth,
    countValue: myTipContractsCount,
    amountValue: myTipImmediateSum,
    previousAmountValue: myTipImmediatePrevSum,
  };
  const totalCard: ProductionCard = {
    id: "total",
    tone: "total",
    titleTop: copy.cards.total.titleTop,
    titleBottom: copy.cards.total.titleBottom,
    description: copy.cards.total.description,
    icon: BarChart3,
    countLabel: copy.cards.total.countLabel,
    commissionLabel: copy.commission,
    previousMonthLabel: copy.previousMonth,
    countValue: totalContractsCount,
    amountValue: totalWithTeam,
    previousAmountValue: totalPrevWithTeam,
  };
  const desktopCards = showOnlyTeamProduction
    ? [teamCard]
    : !showTeamBox
      ? hasTipContract
        ? [ownCard, tipCard]
        : [ownCard]
      : hasTipContract
        ? [ownCard, teamCard, tipCard, totalCard]
        : [ownCard, teamCard, totalCard];
  const mobileCards = showOnlyTeamProduction
    ? [teamCard]
    : !showTeamBox
      ? hasTipContract
        ? [ownCard, tipCard]
        : [ownCard]
      : hasTipContract
        ? [ownCard, teamCard, tipCard, totalCard]
        : [ownCard, teamCard, totalCard];

  useEffect(() => {
    if (mobileCarouselRef.current) {
      mobileCarouselRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
    const resetFrame = window.requestAnimationFrame(() => setMobileCardIndex(0));
    return () => window.cancelAnimationFrame(resetFrame);
  }, [showOnlyTeamProduction, showTeamBox, mobileCards.length]);

  const handleMobileCarouselScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (mobileCards.length <= 1) {
      if (mobileCardIndex !== 0) {
        setMobileCardIndex(0);
      }
      return;
    }
    const viewportWidth = element.clientWidth;
    if (viewportWidth <= 0) return;
    const nextIndex = Math.max(
      0,
      Math.min(mobileCards.length - 1, Math.round(element.scrollLeft / viewportWidth))
    );
    if (nextIndex !== mobileCardIndex) {
      setMobileCardIndex(nextIndex);
    }
  };

  const helpButton = (
    <button
      type="button"
      onClick={() => setHelpOpen(true)}
      aria-label="Otevřít nápovědu k produkci"
      title="Nápověda"
      className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-violet-100/42 bg-violet-100/12 text-violet-50 shadow-[0_10px_24px_rgba(11,3,33,0.32)] backdrop-blur-md transition hover:border-violet-100/72 hover:bg-violet-100/20 focus:outline-none focus:ring-2 focus:ring-violet-100/70"
    >
      <CircleHelp className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
    </button>
  );

  const helpDialog = (
    <HelpDialog
      isOpen={helpOpen}
      onClose={() => setHelpOpen(false)}
      title={showTeamBox ? "Nápověda k týmové produkci" : "Nápověda k produkci poradce"}
      description="Tahle karta ukazuje provizní produkci za aktuální měsíc."
    >
      <div className="space-y-5 text-sm leading-6 text-slate-700">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
          <p className="font-semibold">Základní pravidlo</p>
          <p className="mt-1">
            Zobrazují se zde pouze smlouvy, u kterých datum uzavření spadá do
            aktuálního měsíce. Datum vytvoření záznamu v aplikaci pro tento
            přehled nerozhoduje.
          </p>
        </div>

        {!showOnlyTeamProduction ? (
          <>
            <section>
              <h3 className="text-base font-bold text-slate-950">Vlastní produkce</h3>
              <p className="mt-1">
                Součet okamžitých provizí ze smluv, které má poradce sjednané v
                aktuálním měsíci. U produktů rozdělených na provizní kódy se počítá
                jen okamžitá část, například A101, B0301 a polovina B36/B3601.
                Následné provize a souhrnné řádky se do této částky nezapočítávají.
              </p>
            </section>

            <section>
              <h3 className="text-base font-bold text-slate-950">TIP</h3>
              <p className="mt-1">
                Pokud má poradce TIP výplaty, aplikace je zobrazuje samostatně.
                Počet TIPů vychází ze zdrojových smluv v aktuálním měsíci a částka
                sčítá kladné TIP výplaty. Když je u TIPu známé datum uzavření
                zdrojové smlouvy, používá se ono; jinak se použije datum výplaty.
              </p>
            </section>
          </>
        ) : null}

        {showTeamBox ? (
          <>
            <section>
              <h3 className="text-base font-bold text-slate-950">Týmová produkce</h3>
              <p className="mt-1">
                Manažer zde vidí meziprovize ze smluv v podřízené týmové
                struktuře, opět pouze za smlouvy s datem uzavření v aktuálním
                měsíci. Do částky se počítají jen okamžité části meziprovize,
                ne celá meziprovize ani pozdější následné části.
              </p>
            </section>

            {!showOnlyTeamProduction ? (
              <section>
                <h3 className="text-base font-bold text-slate-950">Celková produkce</h3>
                <p className="mt-1">
                  Celková produkce je součet vlastní produkce, týmové produkce a
                  případných TIP výplat. Počet smluv v celkové kartě je součet
                  vlastních a týmových smluv; TIP má vlastní počet zvlášť.
                </p>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </HelpDialog>
  );

  if (loading) {
    return (
      <section className={containerShellClass} data-fixed-box-theme="slate">
        {helpButton}
        {helpDialog}
        <div className="relative z-10 flex h-full items-center">
          <LoadingProgressPanel
            title={copy.loadingTitle}
            stage={loadingStage}
            progress={clampedLoadingProgress}
            accentLabel={copy.loadingAccent}
            visual="production"
          />
        </div>
      </section>
    );
  }

  if (!showTeamBox) {
    return (
      <section className={containerShellClass} data-fixed-box-theme="slate">
        {helpButton}
        {helpDialog}
        <div className="relative z-10 md:hidden">
          <div
            ref={mobileCarouselRef}
            onScroll={handleMobileCarouselScroll}
            className="overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex">
              {mobileCards.map((card) => (
                <div key={card.id} className="w-full shrink-0 snap-start">
                  <ProductionColumn {...card} />
                </div>
              ))}
            </div>
          </div>
          {mobileCards.length > 1 ? (
            <>
              <div className="mt-2 flex items-center justify-center gap-1.5">
                {mobileCards.map((card, index) => (
                  <span
                    key={card.id}
                    className={`h-1.5 rounded-full transition-all ${
                      index === mobileCardIndex ? "w-5 bg-violet-100/90" : "w-1.5 bg-violet-100/35"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] font-medium text-violet-100/68">
                {copy.swipeHint}
              </p>
            </>
          ) : null}
        </div>

        <div className={`relative z-10 hidden gap-3 md:grid ${hasTipContract ? "md:grid-cols-2" : ""}`}>
          {hasTipContract ? <ShortDividerLines columns={2} visibilityClass="md:block" /> : null}
          {desktopCards.map((card) => (
            <ProductionColumn key={card.id} {...card} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={containerShellClass} data-fixed-box-theme="slate">
      {helpButton}
      {helpDialog}
      <div className="relative z-10 md:hidden">
        <div
          ref={mobileCarouselRef}
          onScroll={handleMobileCarouselScroll}
          className="overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex">
            {mobileCards.map((card) => (
              <div key={card.id} className="w-full shrink-0 snap-start">
                <ProductionColumn {...card} />
              </div>
            ))}
          </div>
        </div>

        {mobileCards.length > 1 ? (
          <>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {mobileCards.map((card, index) => (
                <span
                  key={card.id}
                  className={`h-1.5 rounded-full transition-all ${
                    index === mobileCardIndex ? "w-5 bg-violet-100/90" : "w-1.5 bg-violet-100/35"
                  }`}
                />
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] font-medium text-violet-100/68">
              {copy.swipeHint}
            </p>
          </>
        ) : null}
      </div>

      <div
        className={`relative z-10 hidden gap-3 md:grid ${
          showOnlyTeamProduction
            ? "md:grid-cols-1"
            : hasTipContract
              ? "md:grid-cols-2 xl:grid-cols-4"
              : "md:grid-cols-3"
        }`}
      >
        {showOnlyTeamProduction ? null : hasTipContract ? (
          <>
            <ShortDividerLines columns={2} visibilityClass="md:block xl:hidden" />
            <ShortDividerLines columns={4} visibilityClass="xl:block" />
          </>
        ) : (
          <ShortDividerLines columns={3} visibilityClass="md:block" />
        )}

        {desktopCards.map((card) => (
          <ProductionColumn key={card.id} {...card} />
        ))}
      </div>
    </section>
  );
}
