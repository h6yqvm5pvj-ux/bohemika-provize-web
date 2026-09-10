import { type UIEvent, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  HeartPulse,
  ShieldCheck,
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

import { ProductionIllustration } from "./ProductionIllustration";
import styles from "./ProductionSummarySection.module.css";
import type { ProductionPremiums } from "../productionPremiums";

type Props = {
  language: AppLanguage;
  loading: boolean;
  showTeamBox: boolean;
  showOnlyTeamProduction?: boolean;
  myPremiums: ProductionPremiums;
  teamPremiums: ProductionPremiums;
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

const PRODUCTION_SUMMARY_COPY: Record<
  AppLanguage,
  {
    previousMonth: string;
    commission: string;
    loadingTitle: string;
    loadingAccent: string;
    loadingDescription: string;
    swipeHint: string;
    cards: Record<
      ProductionTone,
      {
        titleTop: string;
        titleBottom: string;
        description?: string;
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
    loadingDescription: "Připravuji smlouvy, provize a přehled za vybrané období.",
    swipeHint: "Swipe do strany pro další produkci.",
    cards: {
      own: {
        titleTop: "Vlastní",
        titleBottom: "produkce",
        countLabel: "Počet smluv",
      },
      team: {
        titleTop: "Týmová",
        titleBottom: "produkce",
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
  const ArrowIcon =
    trend.direction === "up"
      ? ArrowUpRight
      : trend.direction === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <div
      className={styles.trend}
      data-direction={trend.direction}
    >
      <ArrowIcon className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden="true" />
      <span>{trend.label}</span>
      <span className={styles.trendCaption}>{previousMonthLabel}</span>
    </div>
  );
}

type ProductionColumnProps = {
  tone: ProductionTone;
  titleTop: string;
  titleBottom: string;
  description?: string;
  icon: LucideIcon;
  countLabel: string;
  commissionLabel: string;
  previousMonthLabel: string;
  countValue: number;
  amountValue: number;
  previousAmountValue: number;
  premiums?: ProductionPremiums;
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
  premiums,
}: ProductionColumnProps) {
  return (
    <article className={styles.column} data-tone={tone}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        <div className={styles.illustration}><ProductionIllustration tone={tone} /></div>
        <h2>{titleTop} {titleBottom}</h2>
      </div>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.commission}>
        <p className={styles.label}>{commissionLabel}</p>
        <p className={styles.amount}><AnimatedMoney value={amountValue} /></p>
        <TrendInline currentValue={amountValue} previousValue={previousAmountValue} previousMonthLabel={previousMonthLabel} />
      </div>
      <div className={styles.contractCount}>
        <span>{countLabel}</span><strong><AnimatedNumber value={countValue} /></strong>
      </div>
      {premiums && (
        <dl aria-label="Pojistné sjednaných smluv" className={styles.premiums}>
          <div className={styles.premiumRow}>
            <dt><HeartPulse size={15} aria-hidden="true" /><span>Životní<small>Měsíční pojistné</small></span></dt>
            <dd><AnimatedMoney value={premiums.lifeMonthly} /></dd>
          </div>
          <div className={styles.premiumRow}>
            <dt><ShieldCheck size={15} aria-hidden="true" /><span>Vedlejší<small>Roční pojistné</small></span></dt>
            <dd><AnimatedMoney value={premiums.otherAnnual} /></dd>
          </div>
        </dl>
      )}
    </article>
  );
}

export function ProductionSummarySection({
  language,
  loading,
  showTeamBox,
  showOnlyTeamProduction = false,
  myPremiums,
  teamPremiums,
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
  const [mobileCardIndex, setMobileCardIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const containerShellClass = `${styles.shell} ${isLiteUI ? "" : styles.elevated}`;
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
    premiums: myPremiums,
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
    premiums: teamPremiums,
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
    premiums: {
      lifeMonthly: myPremiums.lifeMonthly + teamPremiums.lifeMonthly,
      otherAnnual: myPremiums.otherAnnual + teamPremiums.otherAnnual,
    },
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
  const mobileCards = desktopCards;

  useEffect(() => {
    if (mobileCarouselRef.current) {
      mobileCarouselRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
    const resetFrame = window.requestAnimationFrame(() => setMobileCardIndex(0));
    return () => window.cancelAnimationFrame(resetFrame);
  }, [showOnlyTeamProduction, showTeamBox, mobileCards.length, loading]);

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
      className={styles.helpButton}
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

        <section>
          <h3 className="text-base font-bold text-slate-950">Pojistné sjednaných smluv</h3>
          <p className="mt-1">
            Životní pojištění ukazuje součet měsíčního pojistného. Vedlejší produkty
            ukazují součet ročního pojistného ostatních pojištění; splátky se přepočítávají
            podle frekvence placení. Jde o pojistné evidované u stejných smluv jako počet
            smluv výše, nikoli o provize nebo upravenou provizní základnu.
            Tým zahrnuje celé pojistné podřízených smluv, celkem je součet vlastní a týmové části.
            Samostatné TIP výplaty ani nákupy zlata se do pojistného nepřičítají.
          </p>
        </section>

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

  return (
    <section className={containerShellClass} data-fixed-box-theme="slate" aria-label="Přehled produkce">
      <div className={styles.header}>
        <div><BarChart3 size={16} aria-hidden="true" /><span>Přehled produkce</span><span className={styles.period}>Aktuální měsíc</span></div>
        {helpButton}
      </div>
      {helpDialog}
      {loading ? (
        <div className={styles.loading}><LoadingProgressPanel title={copy.loadingTitle}
          description={showOnlyTeamProduction ? "Připravuji přehled týmových smluv a provizí." : copy.loadingDescription}
          accentLabel={copy.loadingAccent} visual="production" /></div>
      ) : <>
        <div className={styles.mobile}>
          <div ref={mobileCarouselRef} onScroll={handleMobileCarouselScroll} className={styles.carousel}>
            <div className={styles.track}>
              {mobileCards.map(card => <div key={card.id} className={styles.slide}><ProductionColumn {...card} /></div>)}
            </div>
          </div>
          {mobileCards.length > 1 && <div className={styles.pagination} aria-label="Výběr produkce">
            {mobileCards.map((card, index) => <button type="button" key={card.id}
              aria-label={`Zobrazit: ${card.titleTop} ${card.titleBottom}`}
              aria-current={index === mobileCardIndex ? "true" : undefined}
              onClick={() => {
                const carousel = mobileCarouselRef.current;
                carousel?.scrollTo({ left: carousel.clientWidth * index, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
              }}><span /></button>)}
          </div>}
        </div>
        <div className={styles.desktop} data-columns={desktopCards.length}>
          {desktopCards.map(card => <ProductionColumn key={card.id} {...card} />)}
        </div>
      </>}
    </section>
  );
}
