"use client";

import { ArrowUpRight, CalendarDays, ChartNoAxesCombined, CheckCircle2, Coins, Gem, Info, ShieldCheck, TrendingDown, TrendingUp, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";
import styles from "./GoldInvestment.module.css";
import themeStyles from "../life-insurance/lifeInsuranceTheme.module.css";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";

type GoldPoint = { t: number; v: number };
type GoldResponse = {
  ok: boolean;
  history?: GoldPoint[];
  changesPct?: {
    "1m"?: number;
    "1y"?: number;
    "3y"?: number;
    "5y"?: number;
    "10y"?: number;
  };
  asOfDate?: string;
  updatedAt?: string;
  ts?: number;
  stale?: boolean;
  error?: string;
  message?: string;
};

const PERIOD_KEYS = ["1m", "1y", "3y", "5y", "10y"] as const;

const GOLD_COPY = {
  cs: {
    category: "Investiční zlato a stříbro", heroTitle: "Proč investovat do zlata?", heroStatement: "Zlato – jeden z nejprověřenějších uchovatelů hodnoty v historii lidstva", intro: "Fyzické zlato může doplnit portfolio o dlouhodobé, globálně obchodované aktivum.", imageAlt: "Dva investiční zlaté slitky PAMP", portfolio: "Zlato v portfoliu", benefits: [["Diverzifikace portfolia", "Aktivum s odlišným vývojem než běžné finanční trhy."], ["Ochrana kupní síly", "Dlouhodobý prvek portfolia v období nejistoty a inflace."], ["Fyzické a likvidní aktivum", "Majetek, který je možné držet a obchodovat globálně."], ["Bezpečný přístav v krizi", "V době válek, politické nestability nebo pádu akciových trhů cena zlata často roste."], ["Daňové výhody", "Investiční zlato je při splnění zákonných podmínek osvobozeno od DPH; u fyzických osob je příjem z prodeje zpravidla osvobozen od daně z příjmů, pokud zlato neslouží k podnikání."]] as const,
    investmentOptions: "Jak lze investovat", oneOffTitle: "Jednorázový nákup", oneOffText: "Pro chvíli, kdy chcete část prostředků převést do fyzického zlata.", savingsTitle: "Spořicí plány od 500 Kč měsíčně", savingsText: "S každou platbou nakoupíte poměrnou část zlata. Tím se liší od klasického spoření. Po dospoření obdržíte vámi zvolený slitek.", consider: "Na co myslet před nákupem", considerText: "Zlato je dlouhodobá investice a jeho cena může kolísat. Před nákupem vždy zvažte svůj investiční horizont, likviditu, rozdíl mezi nákupní a výkupní cenou i způsob úschovy. Zlato by mělo portfolio doplňovat, ne tvořit jeho převážnou část.", chartTitle: "Výkon zlata v CZK / oz", chartAria: "Vývoj ceny zlata za posledních deset let", historyLoading: "Načítám desetiletou historii…", current: "Aktuálně", liveData: "Živá data", loadingData: "Načítám živá data…", staleData: "Poslední dostupná data", rise: "Růst", decline: "Pokles", periods: ["1 měsíc", "1 rok", "3 roky", "5 let", "10 let"], partners: "Partneři pro investiční zlato a stříbro", goldBarsAlt: "Zlaté slitky", ctaTitle: "Zaujala vás investice do zlata? Pojďme se na to podívat.", meetingCta: "Sjednat schůzku", meetingTitle: "Domluvte si termín", meetingDescription: "Nechte na sebe kontakt a poradce se vám brzy ozve.", closeForm: "Zavřít formulář", submitted: "Žádost byla odeslána.", thankYou: "Děkujeme, brzy se vám ozveme.", footer: "Historická výkonnost není zárukou budoucích výnosů. Investici vždy vybíráme podle vaší situace a cíle.",
  },
  en: {
    category: "Investment gold and silver", heroTitle: "Why invest in gold?", heroStatement: "Gold — one of the most proven stores of value in human history", intro: "Physical gold can complement a portfolio with a long-term, globally traded asset.", imageAlt: "Two PAMP investment gold bars", portfolio: "Gold in your portfolio", benefits: [["Portfolio diversification", "An asset that behaves differently from conventional financial markets."], ["Protection of purchasing power", "A long-term portfolio component in periods of uncertainty and inflation."], ["Tangible and liquid asset", "An asset you can hold and trade globally."], ["A safe haven in a crisis", "During wars, political instability or stock-market declines, the price of gold often rises."], ["Tax advantages", "When statutory conditions are met, investment gold is VAT-exempt; for individuals, income from a sale is generally exempt from income tax if the gold is not used for business."]] as const,
    investmentOptions: "Ways to invest", oneOffTitle: "One-off purchase", oneOffText: "For when you want to convert part of your funds into physical gold.", savingsTitle: "Savings plans from CZK 500 per month", savingsText: "With every payment, you buy a proportional part of gold. This differs from traditional saving. Once the amount is saved, you receive the gold bar you selected.", consider: "What to consider before buying", considerText: "Gold is a long-term investment and its price can fluctuate. Before purchasing, consider your investment horizon, liquidity, the difference between the purchase and buyback price, and storage. Gold should complement your portfolio, not make up most of it.", chartTitle: "Gold performance in CZK / oz", chartAria: "Gold price development over the last ten years", historyLoading: "Loading ten-year history…", current: "Current", liveData: "Live data", loadingData: "Loading live data…", staleData: "Latest available data", rise: "Increase", decline: "Decrease", periods: ["1 month", "1 year", "3 years", "5 years", "10 years"], partners: "Partners for investment gold and silver", goldBarsAlt: "Gold bars", ctaTitle: "Interested in investing in gold? Let’s take a look together.", meetingCta: "Book a meeting", meetingTitle: "Arrange a meeting", meetingDescription: "Leave your contact details and an adviser will get back to you soon.", closeForm: "Close form", submitted: "Your request has been sent.", thankYou: "Thank you, we will be in touch soon.", footer: "Past performance is not a guarantee of future returns. We always select investments according to your situation and goals.",
  },
  uk: {
    category: "Інвестиційне золото та срібло", heroTitle: "Чому варто інвестувати в золото?", heroStatement: "Золото — один із найперевіреніших засобів збереження вартості в історії людства", intro: "Фізичне золото може доповнити портфель довгостроковим активом, яким торгують у всьому світі.", imageAlt: "Два інвестиційні золоті злитки PAMP", portfolio: "Золото в портфелі", benefits: [["Диверсифікація портфеля", "Актив із динамікою, відмінною від звичайних фінансових ринків."], ["Захист купівельної спроможності", "Довгострокова складова портфеля в періоди невизначеності та інфляції."], ["Фізичний і ліквідний актив", "Майно, яке можна зберігати й продавати в усьому світі."], ["Тиха гавань у кризі", "Під час воєн, політичної нестабільності або падіння фондових ринків ціна золота часто зростає."], ["Податкові переваги", "За виконання законних умов інвестиційне золото звільняється від ПДВ; для фізичних осіб дохід від продажу зазвичай звільняється від податку на прибуток, якщо золото не використовується для бізнесу."]] as const,
    investmentOptions: "Як можна інвестувати", oneOffTitle: "Одноразова купівля", oneOffText: "Коли ви хочете перевести частину коштів у фізичне золото.", savingsTitle: "Плани заощаджень від 500 Kč на місяць", savingsText: "З кожним платежем ви купуєте пропорційну частину золота. Це відрізняється від класичного заощадження. Після накопичення ви отримаєте обраний злиток.", consider: "Що врахувати перед купівлею", considerText: "Золото є довгостроковою інвестицією, і його ціна може коливатися. Перед купівлею врахуйте інвестиційний горизонт, ліквідність, різницю між ціною купівлі та викупу й спосіб зберігання. Золото має доповнювати портфель, а не становити його більшість.", chartTitle: "Динаміка золота в CZK / oz", chartAria: "Динаміка ціни золота за останні десять років", historyLoading: "Завантажуємо десятирічну історію…", current: "Зараз", liveData: "Поточні дані", loadingData: "Завантажуємо дані…", staleData: "Останні доступні дані", rise: "Зростання", decline: "Зниження", periods: ["1 місяць", "1 рік", "3 роки", "5 років", "10 років"], partners: "Партнери з інвестиційного золота та срібла", goldBarsAlt: "Золоті злитки", ctaTitle: "Зацікавилися інвестицією в золото? Давайте розглянемо її разом.", meetingCta: "Запланувати зустріч", meetingTitle: "Домовтеся про зустріч", meetingDescription: "Залиште контакти, і консультант незабаром вам зателефонує.", closeForm: "Закрити форму", submitted: "Запит надіслано.", thankYou: "Дякуємо, незабаром ми з вами зв’яжемося.", footer: "Історична дохідність не гарантує майбутніх результатів. Ми завжди обираємо інвестиції відповідно до вашої ситуації та цілей.",
  },
} as const;

const localeToIntl: Record<OnlineCardLocale, string> = { cs: "cs-CZ", en: "en-GB", uk: "uk-UA" };

const formatPercent = (value: number | undefined, locale: OnlineCardLocale) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString(localeToIntl[locale], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
};

const formatGoldPrice = (value: number, locale: OnlineCardLocale) => `${Math.round(value).toLocaleString(localeToIntl[locale])} Kč/oz`;

const formatChartDate = (timestamp: number, locale: OnlineCardLocale) => new Intl.DateTimeFormat(localeToIntl[locale], {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(timestamp * 1000);

const formatUpdatedAt = (value: string | undefined, locale: OnlineCardLocale) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(localeToIntl[locale], { hour: "2-digit", minute: "2-digit" }).format(timestamp);
};

const getUpdatedLabel = (data: GoldResponse | null, locale: OnlineCardLocale) => {
  const fromUpdatedAt = formatUpdatedAt(data?.updatedAt, locale);
  if (fromUpdatedAt) return fromUpdatedAt;
  if (typeof data?.ts === "number" && Number.isFinite(data.ts)) {
    return new Intl.DateTimeFormat(localeToIntl[locale], { hour: "2-digit", minute: "2-digit" }).format(data.ts);
  }
  return null;
};

function GoldLineChart({
  points,
  lightMode,
  locale,
  copy,
}: {
  points: GoldPoint[];
  lightMode: boolean;
  locale: OnlineCardLocale;
  copy: (typeof GOLD_COPY)[OnlineCardLocale];
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chart = useMemo(() => {
    const clean = points
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v) && point.v > 0)
      .sort((a, b) => a.t - b.t);
    const maxPoints = 260;
    const step = Math.max(1, Math.ceil(clean.length / maxPoints));
    const sampled = clean.filter((_, index) => index % step === 0 || index === clean.length - 1);
    if (sampled.length < 2) return null;

    const values = sampled.map((point) => point.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, Math.max(max * 0.05, 1));
    const left = 26;
    const right = 974;
    const top = 18;
    const bottom = 252;
    const plottedPoints = sampled.map((point, index) => {
      const x = left + (index / (sampled.length - 1)) * (right - left);
      const y = bottom - ((point.v - min + spread * 0.08) / (spread * 1.16)) * (bottom - top);
      return { ...point, x, y };
    });
    const line = plottedPoints.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L ${right} ${bottom} L ${left} ${bottom} Z`;

    return {
      line,
      area,
      points: plottedPoints,
      from: new Date(sampled[0].t * 1000).getFullYear(),
      to: new Date((sampled.at(-1)?.t ?? sampled[0].t) * 1000).getFullYear(),
    };
  }, [points]);

  if (!chart) {
    return <div className={styles.chartEmpty} role="status">{copy.historyLoading}</div>;
  }

  const hoveredPoint = hoveredIndex === null ? null : chart.points[hoveredIndex] ?? null;
  const latestPoint = chart.points.at(-1) ?? null;
  const updateHoveredPoint = (clientX: number, svg: SVGSVGElement) => {
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width) return;
    const cursorX = ((clientX - bounds.left) / bounds.width) * 1000;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    chart.points.forEach((point, index) => {
      const distance = Math.abs(point.x - cursorX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setHoveredIndex(closestIndex);
  };

  return (
    <div className={styles.chart}>
      <svg
        className={styles.chartSvg}
        viewBox="0 0 1000 280"
        preserveAspectRatio="none"
        role="img"
        aria-label={copy.chartAria}
        onPointerMove={event => updateHoveredPoint(event.clientX, event.currentTarget)}
        onPointerDown={event => updateHoveredPoint(event.clientX, event.currentTarget)}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id="gold-chart-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--gold-metal)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--gold-metal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={chart.area} fill="url(#gold-chart-area)" />
        <path d={chart.line} fill="none" stroke="var(--gold-metal)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {hoveredPoint ? (
          <g pointerEvents="none">
            <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1="12" y2="252" stroke="var(--life-muted)" strokeOpacity="0.5" strokeDasharray="5 6" vectorEffect="non-scaling-stroke" />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="7" fill={lightMode ? "#fff" : "#14222d"} stroke="var(--gold-metal)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
        ) : null}
      </svg>
      {latestPoint && !hoveredPoint ? (
        <div className={`${styles.chartTooltip} ${styles.chartLatest}`} style={{ top: `${Math.max(18, Math.min(68, (latestPoint.y / 280) * 100))}%` }}>
          <span>{copy.current}</span>
          <strong>{formatGoldPrice(latestPoint.v, locale)}</strong>
        </div>
      ) : null}
      {hoveredPoint ? (
        <div className={styles.chartTooltip} data-align={hoveredPoint.x > 600 ? "left" : "right"} style={{ left: `${(hoveredPoint.x / 1000) * 100}%`, top: `${Math.max(22, Math.min(66, (hoveredPoint.y / 280) * 100))}%` }}>
          <span>{formatChartDate(hoveredPoint.t, locale)}</span>
          <strong>{formatGoldPrice(hoveredPoint.v, locale)}</strong>
        </div>
      ) : null}
      <div className={styles.chartYears}><span>{chart.from}</span><span>{chart.to}</span></div>
    </div>
  );
}

type GoldInvestmentContentProps = {
  advisorSlug: string;
  theme: "dark" | "light";
  locale: OnlineCardLocale;
};

export function GoldInvestmentContent({ advisorSlug, theme, locale }: GoldInvestmentContentProps) {
  const [data, setData] = useState<GoldResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingSubmitted, setMeetingSubmitted] = useState(false);
  const meetingDialogRef = useRef<HTMLDialogElement>(null);
  const meetingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const copy = GOLD_COPY[locale];
  const lightMode = theme === "light";
  const updatedLabel = getUpdatedLabel(data, locale);
  const canRequestMeeting = /^[a-z0-9-]+$/i.test(advisorSlug);
  const latestPoint = useMemo(() => (data?.history ?? [])
    .filter(point => Number.isFinite(point.t) && Number.isFinite(point.v) && point.v > 0)
    .reduce<GoldPoint | null>((latest, point) => !latest || point.t > latest.t ? point : latest, null), [data]);

  const openGoldMeetingModal = (event: MouseEvent<HTMLButtonElement>) => {
    if (!canRequestMeeting) return;
    meetingTriggerRef.current = event.currentTarget;
    setMeetingSubmitted(false);
    setMeetingModalOpen(true);
  };

  useEffect(() => {
    const dialog = meetingDialogRef.current;
    if (!meetingModalOpen || !dialog) return;
    dialog.showModal();
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const trigger = meetingTriggerRef.current;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [meetingModalOpen]);

  useEffect(() => {
    const controller = new AbortController();

    const loadGoldData = () => void fetch("/api/gold?range=y10&days=3652", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as GoldResponse | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || payload?.error || "Živá data se nepodařilo načíst.");
        }
        setData(payload);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Živá data se nepodařilo načíst.");
      });

    loadGoldData();
    const refreshId = window.setInterval(loadGoldData, 60_000);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, []);

  return (
    <main data-theme={theme} className={`${themeStyles.theme} ${styles.content}`}>
      <article className={styles.article}>
        <header className={`${themeStyles.hero} ${styles.hero}`}>
          <div className={styles.heroLayout}>
            <div>
              <p className={styles.eyebrow}><Gem aria-hidden="true" />{copy.category}</p>
              <h1 className={themeStyles.heroTitle}>{copy.heroTitle}</h1>
              <p className={styles.heroStatement}>{copy.heroStatement}</p>
              <p className={themeStyles.heroIntro}>{copy.intro}</p>
              {canRequestMeeting ? <button type="button" onClick={openGoldMeetingModal} className={`${styles.button} ${styles.heroButton}`}>
                {copy.meetingCta}<ArrowUpRight aria-hidden="true" />
              </button> : null}
            </div>
            <div className={styles.heroArtwork}>
              <Image src="/images/investicni-zlato-pamp.png" alt={copy.imageAlt} fill sizes="(max-width: 639px) 280px, (max-width: 900px) 360px, 440px" priority />
            </div>
          </div>
        </header>

        <div className={styles.overview}>
          <section className={styles.market} aria-labelledby="gold-chart-title">
            <div className={styles.marketHeading}>
              <h2 id="gold-chart-title" className={styles.eyebrow}><ChartNoAxesCombined aria-hidden="true" />{copy.chartTitle}</h2>
              <span className={styles.dataStatus} data-live={!!data && !data.stale}>
                {data?.stale ? copy.staleData : data ? `${copy.liveData}${updatedLabel ? ` · ${updatedLabel}` : ""}` : copy.loadingData}
              </span>
            </div>
            <div className={styles.price}>
              <span>{copy.current}</span>
              <p>{latestPoint ? Math.round(latestPoint.v).toLocaleString(localeToIntl[locale]) : "—"}<small>Kč/oz</small></p>
            </div>
            <GoldLineChart points={data?.history ?? []} lightMode={lightMode} locale={locale} copy={copy} />
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <dl className={styles.returns}>
              {PERIOD_KEYS.map((key, index) => {
                const value = data?.changesPct?.[key];
                const trend = typeof value !== "number" ? "flat" : value > 0 ? "up" : value < 0 ? "down" : "flat";
                return <div key={key}>
                  <dt>{copy.periods[index]}</dt>
                  <dd data-trend={trend}>
                    {formatPercent(value, locale)}
                    {trend === "up" ? <TrendingUp aria-label={copy.rise} /> : trend === "down" ? <TrendingDown aria-label={copy.decline} /> : null}
                  </dd>
                </div>;
              })}
            </dl>
            <p className={styles.chartNote}>{copy.footer}</p>
          </section>
          <section className={styles.portfolio} aria-labelledby="gold-portfolio-title">
            <p className={styles.eyebrow}><span>01</span><ShieldCheck aria-hidden="true" />{copy.category}</p>
            <h2 id="gold-portfolio-title" className={styles.heading}>{copy.portfolio}</h2>
            <ol className={styles.benefits}>
              {copy.benefits.map(([title, detail], index) => <li key={title}>
                <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{title}</h3><p>{detail}</p></div>
              </li>)}
            </ol>
          </section>
        </div>

        <section className={styles.options} aria-labelledby="gold-options-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}><span>02</span><Coins aria-hidden="true" />{copy.category}</p>
            <h2 id="gold-options-title" className={styles.heading}>{copy.investmentOptions}</h2>
          </div>
          <div className={styles.optionGrid}>
            <div className={styles.optionCard}>
              <span className={styles.optionIcon}><Gem aria-hidden="true" /></span>
              <h3>{copy.oneOffTitle}</h3><p>{copy.oneOffText}</p>
            </div>
            <div className={styles.optionCard}>
              <span className={styles.optionIcon}><Coins aria-hidden="true" /></span>
              <h3>{copy.savingsTitle}</h3><p>{copy.savingsText}</p>
            </div>
          </div>
          <aside className={styles.consider}>
            <Info aria-hidden="true" />
            <div><h3>{copy.consider}</h3><p>{copy.considerText}</p></div>
          </aside>
        </section>

        <section className={styles.partners} aria-labelledby="gold-partners-title">
          <h2 id="gold-partners-title" className={styles.eyebrow}>{copy.partners}</h2>
          <div className={styles.partnerLogos}>
            <div className={styles.partner}><Image src="/icons/cclogo1.png" alt="Comfort Commodity" width={1110} height={271} sizes="180px" /></div>
            <div className={`${styles.partner} ${styles.partnerDark}`}><Image src="/images/ekkagold.png" alt="Ekka Gold" width={1672} height={941} sizes="150px" /></div>
          </div>
        </section>

        <section className={styles.contact} aria-labelledby="gold-contact-title">
          <div>
            <p className={styles.eyebrow}><span>03</span><Gem aria-hidden="true" />{copy.category}</p>
            <h2 id="gold-contact-title" className={styles.heading}>{copy.ctaTitle}</h2>
            {canRequestMeeting ? <button type="button" onClick={openGoldMeetingModal} className={styles.button}>
              {copy.meetingCta}<ArrowUpRight aria-hidden="true" />
            </button> : null}
          </div>
          <Image src="/images/investicni-zlato-slitky.png" alt={copy.goldBarsAlt} width={1536} height={1024} sizes="(max-width: 639px) 220px, 340px" className={styles.contactArtwork} />
        </section>
        <footer className={styles.footer}>{copy.footer}</footer>
      </article>

      {meetingModalOpen && canRequestMeeting ? (
        <dialog ref={meetingDialogRef} aria-labelledby="gold-meeting-title" onCancel={() => setMeetingModalOpen(false)} className={`${themeStyles.meetingDialog} ${styles.meetingDialog}`}>
          <div className={styles.meetingLayout}>
            <div className={`${themeStyles.meetingPanel} ${styles.meetingPanel}`}>
              <div className={styles.meetingHeader}>
                <span className={`${themeStyles.meetingIcon} ${styles.meetingIcon}`}><CalendarDays aria-hidden="true" /></span>
                <div>
                  <p className={`${themeStyles.meetingKicker} ${styles.eyebrow}`}>{copy.meetingCta}</p>
                  <h2 id="gold-meeting-title" className={styles.meetingTitle}>{copy.meetingTitle}</h2>
                  <p className={styles.meetingDescription}>{copy.meetingDescription}</p>
                </div>
                <button type="button" onClick={() => setMeetingModalOpen(false)} className={`${themeStyles.close} ${styles.close}`} aria-label={copy.closeForm}><X aria-hidden="true" /></button>
              </div>
              {meetingSubmitted ? <div className={`${themeStyles.success} ${styles.success}`} role="status">
                <CheckCircle2 aria-hidden="true" /><div><p>{copy.submitted}</p><p>{copy.thankYou}</p></div>
              </div> : <OnlineCardMeetingStepper slug={advisorSlug} locale={locale} palette="bohemika" initialSelectedTopics={["precious-metals"]} initialStep={1} onSubmitted={() => setMeetingSubmitted(true)} />}
            </div>
          </div>
        </dialog>
      ) : null}
    </main>
  );
}
