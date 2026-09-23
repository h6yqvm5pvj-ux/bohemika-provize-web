"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  FileCheck2,
  HeartHandshake,
  HeartPulse,
  Plus,
  ShieldCheck,
  TrendingDown,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import themeStyles from "./life-insurance/lifeInsuranceTheme.module.css";
import { useEffect, useRef, useState } from "react";
import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";
import { SickLeaveDialog } from "@/components/life-insurance/SickLeaveDialog";
import { DailyAccidentDialog } from "@/components/life-insurance/DailyAccidentDialog";
import { DeathDialog } from "@/components/life-insurance/DeathDialog";
import { HospitalisationDialog } from "@/components/life-insurance/HospitalisationDialog";
import { SeriousIllnessDialog } from "@/components/life-insurance/SeriousIllnessDialog";
import { CareDialog } from "@/components/life-insurance/CareDialog";
import { DisabilityDialog } from "@/components/life-insurance/DisabilityDialog";
import { PermanentInjuryDialog } from "@/components/life-insurance/PermanentInjuryDialog";
import { LifeInsuranceHeroMedia } from "@/components/life-insurance/LifeInsuranceHeroMedia";
import { DAILY_ACCIDENT_COPY } from "@/components/life-insurance/dailyAccidentCopy";
import { DEATH_COPY } from "@/components/life-insurance/deathCopy";
import { HOSPITALISATION_COPY } from "@/components/life-insurance/hospitalisationCopy";
import { SERIOUS_ILLNESS_COPY } from "@/components/life-insurance/seriousIllnessCopy";
import { CARE_COPY } from "@/components/life-insurance/careCopy";
import { DISABILITY_COPY } from "@/components/life-insurance/disabilityCopy";
import { PERMANENT_INJURY_COPY } from "@/components/life-insurance/permanentInjuryCopy";
import { SICK_LEAVE_COPY } from "@/components/life-insurance/sickLeaveCopy";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import { DISABILITY_PENSION_STATISTICS } from "@/lib/disabilityPensionStatistics";

function formatAveragePension(amount: number, locale: OnlineCardLocale): string {
  return locale === "en"
    ? `CZK ${amount.toLocaleString("en-GB")}`
    : `${amount.toLocaleString(locale === "uk" ? "uk-UA" : "cs-CZ")} Kč`;
}

const INVALIDITY_COUNTS = ["180 812", "79 864", "154 947"];

const COVERAGE_ITEMS = [
  { id: "death" },
  { id: "disability" },
  { id: "care" },
  { id: "serious-illness" },
  { id: "daily-accident" },
  { id: "permanent-injury" },
  { id: "sick-leave" },
  { id: "hospitalisation" },
] as const;

const CSSZ_COUNTS_URL = "https://www.cssz.cz/documents/20143/2955053/4%20Ukazatele%20prosinec%202025.pdf/9a7180f1-5f7f-62e7-90d8-8347378ed72c";

const LIFE_COPY = {
  cs: {
    contactActions: {
      review: { label: "Zkontrolovat moji smlouvu", message: "Chci zkontrolovat svou stávající smlouvu životního pojištění." },
      options: { label: "Probrat moje možnosti", message: "Chci probrat možnosti životního pojištění podle své situace." },
    },
    category: "Životní a úrazové pojištění", title: "Proč mít životní pojištění?", intro: "Když zdraví nebo schopnost pracovat nečekaně změní plány, správně nastavené pojištění pomáhá ochránit váš příjem, závazky i blízké.",
    protectionTitle: "Ochrana, která dává prostor soustředit se na to podstatné.", protectionText: "Pojištění nenahradí zdraví. Může ale pomoci zachovat finanční stabilitu v náročném období.", protectionFeatures: ["Příjem", "Závazky", "Rodina"],
    decisionKicker: "Než se rozhodnete", decisionTitle: "Položte si pár jednoduchých otázek.", decisionText: "Odpovědi pomohou určit, jakou ochranu a v jakém rozsahu skutečně potřebujete.",
    questions: ["Jsem závislý/á na svém příjmu?", "Mám jistotu, že se můj zdravotní stav v budoucnu nezmění?", "Jak dlouho bych zvládl(a) fungovat bez pravidelného příjmu?", "Co kdyby mi nemoc nebo úraz znemožnily pracovat několik měsíců – nebo dokonce natrvalo?", "Mám dostatečnou finanční rezervu na pokrytí svých závazků, hypotéky a běžných životních nákladů?", "A pokud je na mém příjmu závislá rodina – jak dlouho by to finančně zvládla beze mě?"],
    earlyKicker: "Včasná ochrana", earlyTitle: "Proč životní pojištění sjednat co nejdříve?", earlyPoints: [["Čím dříve, tím výhodněji.", "S rostoucím věkem zpravidla roste i cena pojištění. Včasným sjednáním tak můžete získat výhodnější podmínky."], ["Dnes jste zdraví. Za pár let to může být jinak.", "Prodělaná nemoc či úraz mohou později znamenat vyšší pojistné, výluky, omezené krytí, nebo dokonce odmítnutí pojištění."]], earlyConclusion: "Životní pojištění je proto nejlepší řešit dříve, než ho skutečně potřebujete.",
    statisticsKicker: "Data ČSSZ", statisticsTitle: "Kolik invalidních důchodců je v ČR evidováno?", paidPensions: "Vyplácené invalidní důchody · stav k 31. 12. 2024", peopleReceived: "osob pobíralo invalidní důchod. Ke konci roku 2025 to bylo už", people: "osob", degrees: [["1. stupeň", "Pokles pracovní schopnosti o 35 až 49 %"], ["2. stupeň", "Pokles pracovní schopnosti o 50 až 69 %"], ["3. stupeň", "Pokles pracovní schopnosti o 70 % a více"]], peopleLabel: "lidí", workCapacityDrop: "Pokles pracovní schopnosti", averagePension: "Průměrný sólo důchod", futureQuestion: "Máte jistotu, že se vás toto do budoucna netýká?", source: "Zdroj", countsSource: "ČSSZ — ukazatele za prosinec 2025", averagesSource: "ČSSZ — průměrné výše invalidních důchodů",
    costKicker: "Jiný pohled na cenu", costTitleBefore: "Životní pojištění například za", costTitleAmount: "2 000 Kč měsíčně", costTitleAfter: "může na první pohled působit jako velký výdaj.", costLead: "Podívejme se na něj ale jinak.", dailyPrice: "66 Kč", daily: "denně", costText: "Částka, kterou snadno utratíme za kávu, svačinu nebo jinou každodenní drobnost. Přitom může znamenat plnění v řádu statisíců až milionů korun.",
    coverageKicker: "Rozsah ochrany",
    coverageTitle: "Co všechno lze pojistit?",
    coverageIntro: "Pojištění sestavíme z rizik, která odpovídají vaší životní situaci a potřebám.",
    coverageRisks: ["Smrt", "Invalidita", "Závislost na péči", "Závažná onemocnění a poranění", "Denní odškodné za úraz", "Trvalé následky úrazu", "Pracovní neschopnost", "Hospitalizace"],
    additionalCoverageTitle: "Doplňková připojištění",
    additionalCoverageIntro: "Podle zvoleného produktu lze ochranu rozšířit například o:",
    additionalCoverage: ["Celodenní ošetřování pojištěného", "Náklady asistované reprodukce", "Příspěvek na pořízení zvláštní pomůcky", "Zdravotní a sociální asistence", "Operace dítěte s vrozenou vadou"],
    conclusion: "Životní pojištění nezabrání tomu, aby se něco stalo. Může ale výrazně zmírnit finanční následky, které taková situace přinese.", processKicker: "Jak budeme postupovat", processTitle: "Nejdříve vy. Potom pojištění.", processFirst: "Probereme vaši životní situaci, potřeby a rizika. Podle nich vybereme a nastavíme pojištění na míru.", processStrong: "Vysvětlím vám, co kryje, co nekryje a za jakých podmínek.", processRest: " Nabídku následně porovnáme s konkurencí, abyste přesně věděli, za co platíte a proč.", meetingCta: "Sjednat schůzku", meetingTitle: "Domluvte si termín", meetingDescription: "Nechte na sebe kontakt a poradce se vám brzy ozve.", closeForm: "Zavřít formulář", submitted: "Žádost byla odeslána.", thankYou: "Děkujeme, brzy se vám ozveme.", footer: "Nastavení pojištění vždy vychází z vaší konkrétní životní situace, příjmů, závazků a priorit.",
  },
  en: {
    contactActions: {
      review: { label: "Review my policy", message: "I would like to review my existing life insurance policy." },
      options: { label: "Discuss my options", message: "I would like to discuss life insurance options for my situation." },
    },
    category: "Life and accident insurance", title: "Why take out life insurance?", intro: "When your health or ability to work unexpectedly changes your plans, properly arranged insurance can help protect your income, commitments and loved ones.",
    protectionTitle: "Protection that lets you focus on what matters.", protectionText: "Insurance cannot replace health. It can, however, help maintain financial stability during a difficult period.", protectionFeatures: ["Income", "Commitments", "Family"],
    decisionKicker: "Before you decide", decisionTitle: "Ask yourself a few simple questions.", decisionText: "The answers will help determine the protection you actually need and its appropriate scope.",
    questions: ["Do I depend on my income?", "Can I be certain that my health will not change in the future?", "How long could I manage without a regular income?", "What if an illness or accident prevented me from working for several months – or permanently?", "Do I have enough financial reserves to cover my commitments, mortgage and everyday expenses?", "And if my family relies on my income – how long could they manage financially without me?"],
    earlyKicker: "Early protection", earlyTitle: "Why arrange life insurance as early as possible?", earlyPoints: [["The earlier, the more favourable.", "As you get older, the price of insurance generally increases. Arranging it early can therefore help you secure more favourable terms."], ["You are healthy today. In a few years it may be different.", "A past illness or accident can later mean higher premiums, exclusions, limited cover or even a refusal of insurance."]], earlyConclusion: "Life insurance is best addressed before you actually need it.",
    statisticsKicker: "CSSA data", statisticsTitle: "How many disability-pension recipients are recorded in the Czech Republic?", paidPensions: "Disability pensions paid · status as of 31 Dec 2024", peopleReceived: "people received a disability pension. By the end of 2025, the figure had reached", people: "people", degrees: [["1st degree", "Reduction in work capacity by 35 to 49%"], ["2nd degree", "Reduction in work capacity by 50 to 69%"], ["3rd degree", "Reduction in work capacity by 70% or more"]], peopleLabel: "people", workCapacityDrop: "Reduction in work capacity", averagePension: "Average standalone disability pension", futureQuestion: "Can you be certain this will not affect you in the future?", source: "Source", countsSource: "CSSA — indicators for December 2025", averagesSource: "CSSA — average disability-pension amounts",
    costKicker: "A different view of cost", costTitleBefore: "Life insurance, for example at", costTitleAmount: "CZK 2,000 a month", costTitleAfter: "can seem like a substantial expense at first glance.", costLead: "Let us look at it differently.", dailyPrice: "CZK 66", daily: "a day", costText: "It is an amount we can easily spend on coffee, a snack or another everyday small purchase. Yet it can mean benefits worth hundreds of thousands to millions of Czech crowns.",
    coverageKicker: "Scope of protection",
    coverageTitle: "What can be covered?",
    coverageIntro: "We will build your insurance around the risks that match your life situation and needs.",
    coverageRisks: ["Death", "Disability", "Dependency on care", "Serious illnesses and injuries", "Daily accident benefit", "Permanent consequences of an accident", "Incapacity for work", "Hospitalisation"],
    additionalCoverageTitle: "Additional cover",
    additionalCoverageIntro: "Depending on the product, protection can also be extended to include:",
    additionalCoverage: ["Full-day care of the insured person", "Assisted reproduction costs", "Contribution towards a special aid", "Health and social assistance", "Surgery for a child with a congenital condition"],
    conclusion: "Life insurance will not prevent something from happening. It can, however, significantly reduce the financial consequences such a situation brings.", processKicker: "How we will proceed", processTitle: "You first. Then insurance.", processFirst: "We will discuss your life situation, needs and risks. Based on them, we will select and set up insurance tailored to you.", processStrong: "I will explain what is covered, what is not and under what conditions.", processRest: " We will then compare the offer with the competition, so you know exactly what you are paying for and why.", meetingCta: "Book a meeting", meetingTitle: "Arrange a time", meetingDescription: "Leave your contact details and your advisor will get back to you shortly.", closeForm: "Close form", submitted: "Your request has been sent.", thankYou: "Thank you. We will get back to you soon.", footer: "Insurance is always arranged according to your specific life situation, income, commitments and priorities.",
  },
  uk: {
    contactActions: {
      review: { label: "Перевірити мій договір", message: "Хочу перевірити свій чинний договір страхування життя." },
      options: { label: "Обговорити мої можливості", message: "Хочу обговорити варіанти страхування життя відповідно до моєї ситуації." },
    },
    category: "Страхування життя та від нещасних випадків", title: "Навіщо мати страхування життя?", intro: "Коли здоров’я або здатність працювати несподівано змінюють плани, правильно налаштоване страхування допомагає захистити ваш дохід, зобов’язання та близьких.",
    protectionTitle: "Захист, який дає змогу зосередитися на головному.", protectionText: "Страхування не замінить здоров’я. Але воно може допомогти зберегти фінансову стабільність у складний період.", protectionFeatures: ["Дохід", "Зобов’язання", "Родина"],
    decisionKicker: "Перед рішенням", decisionTitle: "Поставте собі кілька простих запитань.", decisionText: "Відповіді допоможуть визначити, який захист і в якому обсязі вам справді потрібен.",
    questions: ["Чи залежу я від свого доходу?", "Чи можу я бути впевненим(-ою), що мій стан здоров’я в майбутньому не зміниться?", "Як довго я зміг(ла) б прожити без регулярного доходу?", "Що буде, якщо хвороба чи травма не дадуть мені працювати кілька місяців — або назавжди?", "Чи маю я достатній фінансовий резерв для покриття зобов’язань, іпотеки та звичайних витрат?", "А якщо від мого доходу залежить родина — як довго вона фінансово впоралася б без мене?"],
    earlyKicker: "Завчасний захист", earlyTitle: "Чому варто оформити страхування життя якомога раніше?", earlyPoints: [["Чим раніше, тим вигідніше.", "З віком вартість страхування зазвичай зростає. Завчасне оформлення може дати вигідніші умови."], ["Сьогодні ви здорові. За кілька років це може змінитися.", "Перенесена хвороба чи травма згодом можуть означати вищі внески, виключення, обмежене покриття або навіть відмову у страхуванні."]], earlyConclusion: "Страхування життя найкраще вирішувати раніше, ніж воно вам справді знадобиться.",
    statisticsKicker: "Дані ЧССЗ", statisticsTitle: "Скільки отримувачів пенсії по інвалідності зареєстровано в Чехії?", paidPensions: "Виплачувані пенсії по інвалідності · станом на 31. 12. 2024", peopleReceived: "осіб отримували пенсію по інвалідності. Наприкінці 2025 року це було вже", people: "осіб", degrees: [["1-й ступінь", "Зниження працездатності на 35–49%"], ["2-й ступінь", "Зниження працездатності на 50–69%"], ["3-й ступінь", "Зниження працездатності на 70% і більше"]], peopleLabel: "осіб", workCapacityDrop: "Зниження працездатності", averagePension: "Середня самостійна пенсія по інвалідності", futureQuestion: "Чи впевнені ви, що це не стосуватиметься вас у майбутньому?", source: "Джерело", countsSource: "ЧССЗ — показники за грудень 2025", averagesSource: "ЧССЗ — середні розміри пенсій по інвалідності",
    costKicker: "Інший погляд на вартість", costTitleBefore: "Страхування життя, наприклад за", costTitleAmount: "2 000 Kč на місяць", costTitleAfter: "на перший погляд може здаватися великою витратою.", costLead: "Подивімося на це інакше.", dailyPrice: "66 Kč", daily: "на день", costText: "Це сума, яку легко витратити на каву, перекус чи іншу щоденну дрібницю. Водночас вона може означати виплату в сотні тисяч або мільйони крон.",
    coverageKicker: "Обсяг захисту",
    coverageTitle: "Що можна застрахувати?",
    coverageIntro: "Ми підберемо страхування ризиків, які відповідають вашій життєвій ситуації та потребам.",
    coverageRisks: ["Смерть", "Інвалідність", "Залежність від стороннього догляду", "Тяжкі захворювання та травми", "Щоденна виплата в разі травми", "Стійкі наслідки нещасного випадку", "Тимчасова непрацездатність", "Госпіталізація"],
    additionalCoverageTitle: "Додаткові страхові покриття",
    additionalCoverageIntro: "Залежно від обраного продукту захист можна розширити, наприклад, на:",
    additionalCoverage: ["Цілоденний догляд за застрахованою особою", "Витрати на допоміжні репродуктивні технології", "Допомога на придбання спеціального засобу", "Медична та соціальна допомога", "Операція дитини з вродженою вадою"],
    conclusion: "Страхування життя не запобіжить тому, що щось станеться. Але воно може суттєво пом’якшити фінансові наслідки такої ситуації.", processKicker: "Як ми діятимемо", processTitle: "Спочатку ви. Потім страхування.", processFirst: "Ми обговоримо вашу життєву ситуацію, потреби та ризики. На їх основі підберемо й налаштуємо страхування саме для вас.", processStrong: "Я поясню, що покривається, що не покривається і за яких умов.", processRest: " Потім ми порівняємо пропозицію з конкурентами, щоб ви точно знали, за що платите і чому.", meetingCta: "Домовитися про зустріч", meetingTitle: "Домовтеся про час", meetingDescription: "Залиште контактні дані, і ваш консультант незабаром вам відповість.", closeForm: "Закрити форму", submitted: "Ваш запит надіслано.", thankYou: "Дякуємо. Ми незабаром з вами зв’яжемося.", footer: "Страхування завжди налаштовується відповідно до вашої життєвої ситуації, доходів, зобов’язань і пріоритетів.",
  },
} as const;

type LifeInsuranceContentProps = {
  advisorSlug: string;
  theme: "dark" | "light";
  locale: OnlineCardLocale;
};

export function LifeInsuranceContent({ advisorSlug, theme, locale }: LifeInsuranceContentProps) {
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingSubmitted, setMeetingSubmitted] = useState(false);
  const [meetingIntent, setMeetingIntent] = useState<"review" | "options" | null>(null);
  const [activeRisk, setActiveRisk] = useState<(typeof COVERAGE_ITEMS)[number]["id"] | null>(null);
  const meetingDialogRef = useRef<HTMLDialogElement>(null);
  const meetingTriggerRef = useRef<HTMLButtonElement>(null);
  const copy = LIFE_COPY[locale];
  const canRequestMeeting = /^[a-z0-9-]+$/i.test(advisorSlug);
  const primaryTextClass = "text-[var(--life-ink)]";
  const bodyTextClass = "text-[var(--life-muted)]";
  const labelTextClass = "text-[var(--life-accent)]";

  const openMeeting = (intent: typeof meetingIntent = null, trigger?: HTMLButtonElement) => {
    meetingTriggerRef.current = trigger ?? (activeRisk
      ? document.querySelector<HTMLButtonElement>(`button[aria-controls="${activeRisk}-dialog"]`)
      : null);
    setMeetingIntent(intent);
    setActiveRisk(null);
    setMeetingSubmitted(false);
    setMeetingModalOpen(true);
  };

  useEffect(() => {
    const dialog = meetingDialogRef.current;
    if (!meetingModalOpen || !dialog) return;

    dialog.showModal();

    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const trigger = meetingTriggerRef.current;

    return () => {
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [meetingModalOpen, canRequestMeeting]);

  return (
    <main data-theme={theme} className={`${themeStyles.theme} ${themeStyles.content}`}>
      <article className={themeStyles.article}>
        <header className={themeStyles.hero}>
          <div className={themeStyles.heroLayout}>
            <div className="max-w-3xl">
              <p className={`inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] sm:tracking-[0.25em] ${labelTextClass}`}><HeartHandshake className="h-3.5 w-3.5 shrink-0" /> {copy.category}</p>
              <h1 className={themeStyles.heroTitle}>{copy.title}</h1>
              <p className={themeStyles.heroIntro}>{copy.intro}</p>
              {canRequestMeeting && <div className={themeStyles.heroActions}>
                <button type="button" className={themeStyles.heroPrimary} aria-haspopup="dialog"
                  onClick={event => openMeeting("review", event.currentTarget)}>
                  <FileCheck2 aria-hidden="true" /><span>{copy.contactActions.review.label}</span>
                </button>
                <button type="button" className={themeStyles.heroSecondary} aria-haspopup="dialog"
                  onClick={event => openMeeting("options", event.currentTarget)}>
                  <span>{copy.contactActions.options.label}</span><ArrowUpRight aria-hidden="true" />
                </button>
              </div>}
              <ul className={themeStyles.heroFeatures}>
                {[
                  [ShieldCheck, copy.protectionFeatures[0]],
                  [WalletCards, copy.protectionFeatures[1]],
                  [UsersRound, copy.protectionFeatures[2]],
                ].map(([Icon, label]) => {
                  const FeatureIcon = Icon as typeof ShieldCheck;
                  return <li key={label as string}><FeatureIcon aria-hidden="true" />{label as string}</li>;
                })}
              </ul>
            </div>

            <figure className={themeStyles.heroFigure}>
              <LifeInsuranceHeroMedia locale={locale} />
              <figcaption className={themeStyles.heroCaption}>
                <p className={themeStyles.heroProtectionTitle}>{copy.protectionTitle}</p>
                <p className={themeStyles.heroProtectionText}>{copy.protectionText}</p>
              </figcaption>
            </figure>
          </div>
        </header>

        <section className="grid gap-6 py-8 sm:gap-10 sm:py-10 lg:grid-cols-[minmax(260px,0.43fr)_minmax(0,1fr)] lg:gap-16 lg:py-14">
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><CircleHelp className="h-4 w-4" /> {copy.decisionKicker}</p>
            <h2 className={`mt-3 text-3xl font-medium leading-[1.12] tracking-[-0.04em] sm:mt-4 sm:max-w-[12ch] sm:text-5xl sm:leading-[0.95] sm:tracking-[-0.055em] ${primaryTextClass}`}>{copy.decisionTitle}</h2>
            <p className={`mt-5 max-w-sm text-sm leading-relaxed ${bodyTextClass}`}>{copy.decisionText}</p>
          </div>

          <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2 sm:gap-y-6">
            {copy.questions.map((question, index) => (
              <article key={question} className="group relative pl-7 sm:pl-9">
                <span className={`absolute left-0 top-0.5 text-[10px] font-medium tracking-[0.18em] text-[var(--life-accent)]`}>{String(index + 1).padStart(2, "0")}</span>
                <p className={`text-base font-medium leading-snug tracking-[-0.02em] sm:text-lg ${primaryTextClass}`}>{question}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`grid gap-6 py-8 sm:gap-10 sm:py-10 lg:grid-cols-[minmax(260px,0.43fr)_minmax(0,1fr)] lg:gap-16 lg:py-14 border-t border-[var(--life-line)]`}>
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><HeartPulse className="h-4 w-4" /> {copy.earlyKicker}</p>
            <h2 className={`mt-3 text-3xl font-medium leading-[1.12] tracking-[-0.04em] sm:mt-4 sm:max-w-[13ch] sm:text-5xl sm:leading-[0.95] sm:tracking-[-0.055em] ${primaryTextClass}`}>{copy.earlyTitle}</h2>
          </div>

          <div className="space-y-7">
            {copy.earlyPoints.map(([title, text]) => (
              <article key={title}>
                <h3 className={`text-xl font-medium tracking-[-0.03em] sm:text-2xl ${primaryTextClass}`}>{title}</h3>
                <p className={`mt-2 max-w-2xl text-base leading-relaxed ${bodyTextClass}`}>{text}</p>
              </article>
            ))}
            <p className={`max-w-2xl border-l-2 border-cyan-400 pl-5 text-lg font-semibold leading-relaxed tracking-[-0.02em] ${primaryTextClass}`}>{copy.earlyConclusion}</p>
          </div>
        </section>

        <section aria-labelledby="life-statistics-title" className={themeStyles.statistics}>
          <div aria-hidden="true" className={themeStyles.statisticsBackdrop} />
          <div className={themeStyles.statisticsContent}>
            <div className={themeStyles.statisticsHeader}>
              <div className={themeStyles.statisticsIntro}>
                <p className={themeStyles.statisticsKicker}><HeartPulse aria-hidden="true" /> {copy.statisticsKicker}</p>
                <h2 id="life-statistics-title" className={themeStyles.statisticsTitle}>{copy.statisticsTitle}</h2>
                <p className={themeStyles.statisticsSummary}><strong>415 623</strong> {copy.peopleReceived} <strong>418 988 {copy.people}</strong>.</p>
              </div>
              <div className={themeStyles.statisticsTotal}>
                <div className={themeStyles.statisticsMap}>
                  <Image
                    src="/images/life-insurance/czechia-outline-v1.svg"
                    alt=""
                    aria-hidden="true"
                    width={500}
                    height={300}
                    className={themeStyles.statisticsMapShape}
                  />
                  <div className={themeStyles.statisticsMapLabel}>
                    <p className={themeStyles.statisticsMapCount}>415.000+</p>
                    <p className={themeStyles.statisticsDate}>{copy.paidPensions}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={themeStyles.statisticsDegrees}>
              {copy.degrees.map(([level, range], index) => (
                <article key={level} className={themeStyles.statisticsCard}>
                  <h3 className={themeStyles.statisticsDegree}>{level}</h3>
                  <p className={themeStyles.statisticsCardCount}>{INVALIDITY_COUNTS[index]} <span>{copy.peopleLabel}</span></p>
                  <p className={themeStyles.statisticsRange}>
                    <TrendingDown aria-hidden="true" />
                    <span>{range}</span>
                  </p>
                  <div className={themeStyles.statisticsPension}>
                    <p>{copy.averagePension}</p>
                    <p>{formatAveragePension(DISABILITY_PENSION_STATISTICS.degrees[index].averageMonthly, locale)}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className={themeStyles.statisticsQuestion}>
              <ShieldCheck aria-hidden="true" />
              <p>{copy.futureQuestion}</p>
            </div>
            <p className={themeStyles.statisticsSources}>
              {copy.source}: <a className="underline decoration-cyan-500/60 underline-offset-4 transition hover:text-[var(--life-accent)]" href={CSSZ_COUNTS_URL} target="_blank" rel="noreferrer noopener">{copy.countsSource}</a>{" · "}<a className="underline decoration-cyan-500/60 underline-offset-4 transition hover:text-[var(--life-accent)]" href={DISABILITY_PENSION_STATISTICS.sourceUrl} target="_blank" rel="noreferrer noopener">{copy.averagesSource}</a>.
            </p>
          </div>
        </section>

        <section className="grid gap-6 py-9 sm:gap-8 sm:py-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(300px,0.78fr)] lg:items-center lg:gap-16">
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><WalletCards className="h-4 w-4" /> {copy.costKicker}</p>
            <h2 className={`mt-4 max-w-3xl text-3xl font-medium leading-[1.12] tracking-[-0.04em] sm:text-5xl sm:leading-[0.98] sm:tracking-[-0.055em] ${primaryTextClass}`}>{copy.costTitleBefore} <span className="whitespace-nowrap text-[var(--life-accent)]">{copy.costTitleAmount}</span> {copy.costTitleAfter}</h2>
            <p className={`mt-5 text-base leading-relaxed sm:text-lg ${bodyTextClass}`}>{copy.costLead}</p>
          </div>
          <div className={`relative min-h-[265px] overflow-hidden rounded-[26px] border p-5 pb-32 sm:min-h-[310px] sm:p-6 border-[var(--life-line)] bg-[var(--life-soft)]`}>
            <div className={`pointer-events-none absolute inset-5 rounded-[18px] border border-[var(--life-line)]`} />
            <Image
              src="/images/zivotni-pojisteni-kafe.png"
              alt=""
              width={6000}
              height={5300}
              aria-hidden="true"
              sizes="(max-width: 639px) 200px, 526px"
              className="pointer-events-none absolute -bottom-8 -right-8 z-[1] h-44 w-auto select-none object-contain drop-shadow-[0_24px_28px_rgba(16,7,12,0.34)] sm:-bottom-8 sm:-right-28 sm:h-[29rem]"
            />
            <div className="relative z-10">
              <p className={`whitespace-nowrap text-[clamp(2.75rem,14vw,4.5rem)] font-medium leading-none tracking-[-0.065em] sm:text-[5.5rem] lg:text-[6rem] xl:text-[7.5rem] text-[var(--life-accent)]`}>{copy.dailyPrice}</p>
              <p className={`text-xl font-medium tracking-[-0.04em] sm:text-2xl ${primaryTextClass}`}>{copy.daily}</p>
              <p className={`mt-5 max-w-[30ch] text-sm leading-relaxed sm:text-[15px] ${bodyTextClass}`}>{copy.costText}</p>
            </div>
          </div>
        </section>

        <section className={`relative mt-2 overflow-hidden rounded-[26px] p-5 sm:p-10 border border-[var(--life-line)] bg-[var(--life-tint)]`}>
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--life-surface)] text-[var(--life-accent)]`}><BadgeCheck className="h-6 w-6" /></span>
            <p className={`max-w-4xl text-xl font-semibold leading-snug tracking-[-0.03em] sm:text-3xl ${primaryTextClass}`}>{copy.conclusion}</p>
          </div>
        </section>

        <section aria-labelledby="life-coverage-title" className="py-9 sm:py-12">
          <div className="max-w-3xl">
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}>
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              {copy.coverageKicker}
            </p>
            <h2 id="life-coverage-title" className={`mt-3 text-3xl font-medium leading-[1.12] tracking-[-0.04em] sm:mt-4 sm:text-5xl ${primaryTextClass}`}>
              {copy.coverageTitle}
            </h2>
            <p className={`mt-4 max-w-2xl text-base leading-relaxed ${bodyTextClass}`}>{copy.coverageIntro}</p>
          </div>

          <ul className={themeStyles.coverageGrid}>
            {copy.coverageRisks.map((risk, index) => {
              const { id } = COVERAGE_ITEMS[index];
              const detail = id === "death" ? DEATH_COPY[locale].detail
                : id === "care" ? CARE_COPY[locale].detail
                : id === "hospitalisation" ? HOSPITALISATION_COPY[locale].detail
                : id === "serious-illness" ? SERIOUS_ILLNESS_COPY[locale].detail
                : id === "permanent-injury" ? PERMANENT_INJURY_COPY[locale].detail
                : id === "disability" ? DISABILITY_COPY[locale].detail
                : id === "daily-accident" ? DAILY_ACCIDENT_COPY[locale].detail : SICK_LEAVE_COPY[locale].detail;
              const content = <>
                <span className={themeStyles.riskArtwork} aria-hidden="true">
                  <Image
                    src={`/images/life-insurance/risks/${id}-v2.webp`}
                    alt=""
                    width={384}
                    height={384}
                    unoptimized
                  />
                </span>
                <span className={themeStyles.coverageText}>
                  <span className={themeStyles.coverageTitle}>{risk}</span>
                  <span className={themeStyles.coverageDetail}>{detail}</span>
                </span>
                <ArrowUpRight className={themeStyles.coverageArrow} aria-hidden="true" />
              </>;
              return (
                <li key={id} className={themeStyles.coverageItem}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-controls={`${id}-dialog`}
                    onClick={event => { event.currentTarget.focus({ preventScroll: true }); setActiveRisk(id); }}
                    className={themeStyles.coverageCard}
                  >{content}</button>
                </li>
              );
            })}
          </ul>

          <div className={`mt-5 rounded-[22px] p-5 sm:mt-6 sm:p-7 border border-[var(--life-line)] bg-[var(--life-soft)]`}>
            <h3 className={`text-xl font-medium tracking-[-0.03em] ${primaryTextClass}`}>{copy.additionalCoverageTitle}</h3>
            <p className={`mt-2 text-sm leading-relaxed ${bodyTextClass}`}>{copy.additionalCoverageIntro}</p>
            <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {copy.additionalCoverage.map((coverage) => (
                <li key={coverage} className={`flex min-w-0 items-start gap-2.5 text-sm font-medium leading-relaxed ${primaryTextClass}`}>
                  <Plus className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--life-accent)]`} aria-hidden="true" />
                  <span>{coverage}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`grid gap-6 border-t py-9 sm:py-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center md:gap-12 border-[var(--life-line)]`}>
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><HeartHandshake className="h-4 w-4" /> {copy.processKicker}</p>
            <h2 className={`mt-3 max-w-[14ch] text-4xl font-medium leading-[1.08] tracking-[-0.045em] sm:mt-4 sm:text-5xl lg:text-[5rem] lg:leading-[0.95] ${primaryTextClass}`}>{copy.processTitle}</h2>
          </div>
          <div className={`rounded-[22px] p-5 sm:p-8 border border-[var(--life-line)] bg-[var(--life-surface)]`}>
            <p className={`text-base leading-relaxed sm:text-lg ${bodyTextClass}`}>{copy.processFirst}</p>
            <p className={`mt-5 text-base leading-relaxed sm:text-lg ${bodyTextClass}`}><strong className={primaryTextClass}>{copy.processStrong}</strong>{copy.processRest}</p>
            {canRequestMeeting ? (
              <button
                type="button"
                onClick={event => openMeeting(null, event.currentTarget)}
                className={`${themeStyles.primary} mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 sm:mt-7 sm:w-auto`}
              >
                <CalendarDays className="h-4 w-4" />
                {copy.meetingCta}
              </button>
            ) : null}
          </div>
        </section>

        <footer className={`pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-4 text-xs leading-relaxed ${bodyTextClass}`}>{copy.footer}</footer>
      </article>

      {activeRisk === "death" && <DeathDialog
        locale={locale}
        theme={theme}
        onClose={() => setActiveRisk(null)}
        onMeeting={canRequestMeeting ? () => openMeeting() : undefined}
      />}

      {activeRisk === "hospitalisation" && <HospitalisationDialog
        locale={locale}
        theme={theme}
        onClose={() => setActiveRisk(null)}
        onMeeting={canRequestMeeting ? () => openMeeting() : undefined}
      />}

      {activeRisk === "care" && <CareDialog
        locale={locale}
        theme={theme}
        onClose={() => setActiveRisk(null)}
        onMeeting={canRequestMeeting ? () => openMeeting() : undefined}
      />}

      {activeRisk === "serious-illness" && <SeriousIllnessDialog
        locale={locale}
        theme={theme}
        onClose={() => setActiveRisk(null)}
        onMeeting={canRequestMeeting ? () => openMeeting() : undefined}
      />}

      {activeRisk === "sick-leave" && <SickLeaveDialog
        locale={locale}
        theme={theme}
        onClose={() => setActiveRisk(null)}
        onMeeting={canRequestMeeting ? () => openMeeting() : undefined}
      />}

      {activeRisk === "daily-accident" && <DailyAccidentDialog
        locale={locale}
        theme={theme}
        onClose={() => setActiveRisk(null)}
        onMeeting={canRequestMeeting ? () => openMeeting() : undefined}
      />}

      {activeRisk === "disability" && <DisabilityDialog
        locale={locale}
        theme={theme}
        onClose={() => setActiveRisk(null)}
        onMeeting={canRequestMeeting ? () => openMeeting() : undefined}
      />}

      {activeRisk === "permanent-injury" && <PermanentInjuryDialog
        locale={locale}
        theme={theme}
        onClose={() => setActiveRisk(null)}
        onMeeting={canRequestMeeting ? () => openMeeting() : undefined}
      />}

      {meetingModalOpen && canRequestMeeting ? (
        <dialog
          ref={meetingDialogRef}
          aria-labelledby="life-meeting-title"
          onCancel={() => setMeetingModalOpen(false)}
          className={`${themeStyles.meetingDialog} fixed inset-0 m-auto h-[100dvh] max-h-none w-full max-w-none bg-transparent p-0`}
        >
          <div className="flex h-full items-center justify-center px-3 py-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6">
            <div className={`${themeStyles.meetingPanel} relative max-h-full w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[24px] p-4 sm:rounded-[32px] sm:p-6`}>
              <div className="relative flex shrink-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className={`${themeStyles.meetingIcon} hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:inline-flex`}>
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <div>
                    <p className={`${themeStyles.meetingKicker} text-[11px] font-medium uppercase tracking-[0.2em]`}>{copy.meetingCta}</p>
                    <h2 id="life-meeting-title" className={`${themeStyles.meetingTitle} mt-1 text-xl font-medium tracking-[-0.035em] sm:text-2xl`}>{meetingIntent ? copy.contactActions[meetingIntent].label : copy.meetingTitle}</h2>
                    <p className={`${themeStyles.meetingDescription} mt-1 text-sm leading-relaxed`}>{copy.meetingDescription}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMeetingModalOpen(false)}
                  className={`${themeStyles.close} inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition`}
                  aria-label={copy.closeForm}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative [overflow-wrap:anywhere] [&_input]:text-base [&_textarea]:text-base [&_button]:min-h-11 [&_form>div:last-child>div]:flex-wrap [&_form>div:last-child>div]:justify-end">
                {meetingSubmitted ? (
                  <div className={`${themeStyles.success} mt-6 rounded-2xl px-4 py-4`}>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{copy.submitted}</p>
                        <p className="mt-1 text-sm">{copy.thankYou}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <OnlineCardMeetingStepper
                    palette="bohemika"
                    slug={advisorSlug}
                    locale={locale}
                    initialSelectedTopics={["life-accident"]}
                    initialStep={1}
                    initialMessage={meetingIntent ? copy.contactActions[meetingIntent].message : ""}
                    onSubmitted={() => setMeetingSubmitted(true)}
                  />
                )}
              </div>
            </div>
          </div>
        </dialog>
      ) : null}
    </main>
  );
}
