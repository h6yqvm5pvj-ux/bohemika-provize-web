import { DataFreshness } from "./DataFreshness";
import { type UIEvent, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  HeartPulse,
  ShieldCheck,
  Minus,
} from "lucide-react";
import { type AppLanguage } from "@/lib/appLanguage";
import { AnimatedMoney, AnimatedNumber } from "./AnimatedNumbers";
import { LoadingProgressPanel } from "./LoadingProgressPanel";

import styles from "./ProductionSummarySection.module.css";
import type { ProductionPremiums } from "../productionPremiums";

type Props = {
  language: AppLanguage;
  loading: boolean;
  error?: string | null;
  updatedAt?: number | null;
  refreshing?: boolean;
  tipSummaryLoading?: boolean;
  tipSummaryError?: string | null;
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
  countLabel: string;
  commissionLabel: string;
  previousMonthLabel: string;
  countValue: number;
  amountValue: number;
  previousAmountValue: number;
  premiums?: ProductionPremiums;
  amountPending?: boolean;
  amountUnavailable?: boolean;
  countUnavailable?: boolean;
  animate?: boolean;
};

type ProductionCard = ProductionColumnProps & {
  id: string;
};

function ProductionColumn({
  tone,
  titleTop,
  titleBottom,
  description,
  countLabel,
  commissionLabel,
  previousMonthLabel,
  countValue,
  amountValue,
  previousAmountValue,
  premiums,
  amountPending = false,
  amountUnavailable = false,
  countUnavailable = false,
  animate = true,
}: ProductionColumnProps) {
  return (
    <div className={styles.cardBackdrop}>
      <article className={styles.column} data-tone={tone}>
        <div className={styles.paper}>
          <div className={styles.cardHeader}>
            <h2><span>{titleTop}</span>{" "}<span>{titleBottom}</span></h2>
          </div>
          <div className={styles.commission}>
            <p className={styles.label}>{commissionLabel}</p>
            <p className={styles.amount} aria-label={amountPending ? "Načítám TIP produkci" : amountUnavailable ? "Částka není k dispozici" : undefined}>
              {amountPending ? "…" : amountUnavailable ? "—" : <AnimatedMoney value={amountValue} currencyClassName={styles.currency} animate={animate} />}</p>
          </div>
          {premiums && (
            <dl aria-label="Pojistné sjednaných smluv" className={styles.premiums}>
              <div className={styles.premiumRow}>
                <dt><HeartPulse size={15} aria-hidden="true" /><span>Životní<small>Měsíčně</small></span></dt>
                <dd><AnimatedMoney value={premiums.lifeMonthly} currencyClassName={styles.premiumCurrency} animate={animate} /></dd>
              </div>
              <div className={styles.premiumRow}>
                <dt><ShieldCheck size={15} aria-hidden="true" /><span>Vedlejší<small>Ročně</small></span></dt>
                <dd><AnimatedMoney value={premiums.otherAnnual} currencyClassName={styles.premiumCurrency} animate={animate} /></dd>
              </div>
            </dl>
          )}
          {description && <p className={styles.description}>{description}</p>}
        </div>
        <div className={styles.commissionFooter}>
          {amountPending || amountUnavailable ? <p role="status" className={styles.status}>
            {amountPending ? "Načítám TIP produkci…" : "TIP produkce není k dispozici."}
          </p> : <TrendInline currentValue={amountValue} previousValue={previousAmountValue} previousMonthLabel={previousMonthLabel} />}
          <div className={styles.contractCount}>
            <span>{countLabel}</span><strong>{countUnavailable ? "—" : <AnimatedNumber value={countValue} animate={animate} />}</strong>
          </div>
        </div>
      </article>
    </div>
  );
}

export function ProductionSummarySection({
  language,
  loading,
  error,
  updatedAt,
  refreshing,
  tipSummaryLoading = false,
  tipSummaryError = null,
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
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const containerShellClass = `${styles.shell} ${isLiteUI ? "" : styles.elevated}`;
  // Karta tipařské produkce má být viditelná už od první tipařské smlouvy,
  // i kdyby její provize byla zatím nulová.
  const hasTipContract = myTipContractsCount > 0 || tipSummaryLoading || Boolean(tipSummaryError);
  const ownCard: ProductionCard = {
    id: "own",
    tone: "own",
    titleTop: copy.cards.own.titleTop,
    titleBottom: copy.cards.own.titleBottom,
    description: copy.cards.own.description,
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
    countLabel: copy.cards.tip.countLabel,
    commissionLabel: copy.commission,
    previousMonthLabel: copy.previousMonth,
    countValue: myTipContractsCount,
    amountValue: myTipImmediateSum,
    previousAmountValue: myTipImmediatePrevSum,
    amountPending: tipSummaryLoading,
    amountUnavailable: Boolean(tipSummaryError),
    countUnavailable: tipSummaryLoading || Boolean(tipSummaryError),
  };
  const totalCard: ProductionCard = {
    id: "total",
    tone: "total",
    titleTop: copy.cards.total.titleTop,
    titleBottom: copy.cards.total.titleBottom,
    description: copy.cards.total.description,
    countLabel: copy.cards.total.countLabel,
    commissionLabel: copy.commission,
    previousMonthLabel: copy.previousMonth,
    countValue: totalContractsCount,
    amountValue: totalWithTeam,
    previousAmountValue: totalPrevWithTeam,
    amountPending: tipSummaryLoading,
    amountUnavailable: Boolean(tipSummaryError),
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

  if (error && !updatedAt) return <section className={containerShellClass}><p role="alert" className="p-6 text-sm">{error}</p></section>;

  return (
    <section className={containerShellClass} data-fixed-box-theme="slate" aria-label="Přehled produkce">
      {loading && !updatedAt ? (
        <div className={styles.loading}><LoadingProgressPanel title={copy.loadingTitle}
          description={showOnlyTeamProduction ? "Připravuji přehled týmových smluv a provizí." : copy.loadingDescription}
          accentLabel={copy.loadingAccent} visual="production" /></div>
      ) : <>
        {!showOnlyTeamProduction && tipSummaryError && <p role="alert" className="px-5 py-3 text-sm text-amber-900">{tipSummaryError}</p>}
        <div className={styles.mobile}>
          <div ref={mobileCarouselRef} onScroll={handleMobileCarouselScroll} className={styles.carousel}>
            <div className={styles.track}>
              {mobileCards.map(card => <div key={card.id} className={styles.slide}><ProductionColumn {...card} animate={!isLiteUI} /></div>)}
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
          {desktopCards.map(card => <ProductionColumn key={card.id} {...card} animate={!isLiteUI} />)}
        </div>
      </>}
      <div className={styles.freshness}><DataFreshness updatedAt={updatedAt} refreshing={refreshing} error={error} /></div>
    </section>
  );
}
