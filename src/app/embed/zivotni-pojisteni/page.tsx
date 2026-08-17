"use client";

import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  HeartHandshake,
  HeartPulse,
  ShieldCheck,
  TrendingDown,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";

const INVALIDITY_COUNTS = ["180 812", "79 864", "154 947"];

const CSSZ_COUNTS_URL = "https://www.cssz.cz/documents/20143/2955053/4%20Ukazatele%20prosinec%202025.pdf/9a7180f1-5f7f-62e7-90d8-8347378ed72c";
const CSSZ_AVERAGES_URL = "https://www.cssz.cz/documents/20143/2878360/odpoved_106_statistika%2Bduchodu_web.pdf/a9c0a411-ae79-bd96-a31b-e3b3cff4243d?version=1.0";

const LIFE_COPY = {
  cs: {
    category: "Životní a úrazové pojištění", title: "Proč mít životní pojištění?", intro: "Když zdraví nebo schopnost pracovat nečekaně změní plány, správně nastavené pojištění pomáhá ochránit váš příjem, závazky i blízké.",
    protectionTitle: "Ochrana, která dává prostor soustředit se na to podstatné.", protectionText: "Pojištění nenahradí zdraví. Může ale pomoci zachovat finanční stabilitu v náročném období.", protectionFeatures: ["Příjem", "Závazky", "Rodina"],
    decisionKicker: "Než se rozhodnete", decisionTitle: "Položte si pár jednoduchých otázek.", decisionText: "Odpovědi pomohou určit, jakou ochranu a v jakém rozsahu skutečně potřebujete.",
    questions: ["Jsem závislý/á na svém příjmu?", "Mám jistotu, že se můj zdravotní stav v budoucnu nezmění?", "Jak dlouho bych zvládl(a) fungovat bez pravidelného příjmu?", "Co kdyby mi nemoc nebo úraz znemožnily pracovat několik měsíců – nebo dokonce natrvalo?", "Mám dostatečnou finanční rezervu na pokrytí svých závazků, hypotéky a běžných životních nákladů?", "A pokud je na mém příjmu závislá rodina – jak dlouho by to finančně zvládla beze mě?"],
    earlyKicker: "Včasná ochrana", earlyTitle: "Proč životní pojištění sjednat co nejdříve?", earlyPoints: [["Čím dříve, tím výhodněji.", "S rostoucím věkem zpravidla roste i cena pojištění. Včasným sjednáním tak můžete získat výhodnější podmínky."], ["Dnes jste zdraví. Za pár let to může být jinak.", "Prodělaná nemoc či úraz mohou později znamenat vyšší pojistné, výluky, omezené krytí, nebo dokonce odmítnutí pojištění."]], earlyConclusion: "Životní pojištění je proto nejlepší řešit dříve, než ho skutečně potřebujete.",
    statisticsKicker: "Data ČSSZ", statisticsTitle: "Kolik invalidních důchodců je v ČR evidováno?", paidPensions: "Vyplácené invalidní důchody · stav k 31. 12. 2024", peopleReceived: "osob pobíralo invalidní důchod. Ke konci roku 2025 to bylo už", people: "osob", degrees: [["1. stupeň", "Pokles pracovní schopnosti o 35 až 49 %", "9 906 Kč"], ["2. stupeň", "Pokles pracovní schopnosti o 50 až 69 %", "11 704 Kč"], ["3. stupeň", "Pokles pracovní schopnosti o 70 % a více", "17 325 Kč"]], peopleLabel: "lidí", workCapacityDrop: "Pokles pracovní schopnosti", averagePension: "Průměrný sólo důchod", futureQuestion: "Máte jistotu, že se vás toto do budoucna netýká?", source: "Zdroj", countsSource: "ČSSZ — ukazatele za prosinec 2025", averagesSource: "ČSSZ — průměrné výše invalidních důchodů",
    costKicker: "Jiný pohled na cenu", costTitleBefore: "Životní pojištění například za", costTitleAmount: "2 000 Kč měsíčně", costTitleAfter: "může na první pohled působit jako velký výdaj.", costLead: "Podívejme se na něj ale jinak.", dailyPrice: "66 Kč", daily: "denně", costText: "Částka, kterou snadno utratíme za kávu, svačinu nebo jinou každodenní drobnost. Přitom může znamenat plnění v řádu statisíců až milionů korun.",
    conclusion: "Životní pojištění nezabrání tomu, aby se něco stalo. Může ale výrazně zmírnit finanční následky, které taková situace přinese.", processKicker: "Jak budeme postupovat", processTitle: "Nejdříve vy. Potom pojištění.", processFirst: "Probereme vaši životní situaci, potřeby a rizika. Podle nich vybereme a nastavíme pojištění na míru.", processStrong: "Vysvětlím vám, co kryje, co nekryje a za jakých podmínek.", processRest: " Nabídku následně porovnáme s konkurencí, abyste přesně věděli, za co platíte a proč.", meetingCta: "Sjednat schůzku", meetingTitle: "Domluvte si termín", meetingDescription: "Nechte na sebe kontakt a poradce se vám brzy ozve.", closeForm: "Zavřít formulář", submitted: "Žádost byla odeslána.", thankYou: "Děkujeme, brzy se vám ozveme.", footer: "Nastavení pojištění vždy vychází z vaší konkrétní životní situace, příjmů, závazků a priorit.",
  },
  en: {
    category: "Life and accident insurance", title: "Why take out life insurance?", intro: "When your health or ability to work unexpectedly changes your plans, properly arranged insurance can help protect your income, commitments and loved ones.",
    protectionTitle: "Protection that lets you focus on what matters.", protectionText: "Insurance cannot replace health. It can, however, help maintain financial stability during a difficult period.", protectionFeatures: ["Income", "Commitments", "Family"],
    decisionKicker: "Before you decide", decisionTitle: "Ask yourself a few simple questions.", decisionText: "The answers will help determine the protection you actually need and its appropriate scope.",
    questions: ["Do I depend on my income?", "Can I be certain that my health will not change in the future?", "How long could I manage without a regular income?", "What if an illness or accident prevented me from working for several months – or permanently?", "Do I have enough financial reserves to cover my commitments, mortgage and everyday expenses?", "And if my family relies on my income – how long could they manage financially without me?"],
    earlyKicker: "Early protection", earlyTitle: "Why arrange life insurance as early as possible?", earlyPoints: [["The earlier, the more favourable.", "As you get older, the price of insurance generally increases. Arranging it early can therefore help you secure more favourable terms."], ["You are healthy today. In a few years it may be different.", "A past illness or accident can later mean higher premiums, exclusions, limited cover or even a refusal of insurance."]], earlyConclusion: "Life insurance is best addressed before you actually need it.",
    statisticsKicker: "CSSA data", statisticsTitle: "How many disability-pension recipients are recorded in the Czech Republic?", paidPensions: "Disability pensions paid · status as of 31 Dec 2024", peopleReceived: "people received a disability pension. By the end of 2025, the figure had reached", people: "people", degrees: [["1st degree", "Reduction in work capacity by 35 to 49%", "CZK 9,906"], ["2nd degree", "Reduction in work capacity by 50 to 69%", "CZK 11,704"], ["3rd degree", "Reduction in work capacity by 70% or more", "CZK 17,325"]], peopleLabel: "people", workCapacityDrop: "Reduction in work capacity", averagePension: "Average standalone disability pension", futureQuestion: "Can you be certain this will not affect you in the future?", source: "Source", countsSource: "CSSA — indicators for December 2025", averagesSource: "CSSA — average disability-pension amounts",
    costKicker: "A different view of cost", costTitleBefore: "Life insurance, for example at", costTitleAmount: "CZK 2,000 a month", costTitleAfter: "can seem like a substantial expense at first glance.", costLead: "Let us look at it differently.", dailyPrice: "CZK 66", daily: "a day", costText: "It is an amount we can easily spend on coffee, a snack or another everyday small purchase. Yet it can mean benefits worth hundreds of thousands to millions of Czech crowns.",
    conclusion: "Life insurance will not prevent something from happening. It can, however, significantly reduce the financial consequences such a situation brings.", processKicker: "How we will proceed", processTitle: "You first. Then insurance.", processFirst: "We will discuss your life situation, needs and risks. Based on them, we will select and set up insurance tailored to you.", processStrong: "I will explain what is covered, what is not and under what conditions.", processRest: " We will then compare the offer with the competition, so you know exactly what you are paying for and why.", meetingCta: "Book a meeting", meetingTitle: "Arrange a time", meetingDescription: "Leave your contact details and your advisor will get back to you shortly.", closeForm: "Close form", submitted: "Your request has been sent.", thankYou: "Thank you. We will get back to you soon.", footer: "Insurance is always arranged according to your specific life situation, income, commitments and priorities.",
  },
  uk: {
    category: "Страхування життя та від нещасних випадків", title: "Навіщо мати страхування життя?", intro: "Коли здоров’я або здатність працювати несподівано змінюють плани, правильно налаштоване страхування допомагає захистити ваш дохід, зобов’язання та близьких.",
    protectionTitle: "Захист, який дає змогу зосередитися на головному.", protectionText: "Страхування не замінить здоров’я. Але воно може допомогти зберегти фінансову стабільність у складний період.", protectionFeatures: ["Дохід", "Зобов’язання", "Родина"],
    decisionKicker: "Перед рішенням", decisionTitle: "Поставте собі кілька простих запитань.", decisionText: "Відповіді допоможуть визначити, який захист і в якому обсязі вам справді потрібен.",
    questions: ["Чи залежу я від свого доходу?", "Чи можу я бути впевненим(-ою), що мій стан здоров’я в майбутньому не зміниться?", "Як довго я зміг(ла) б прожити без регулярного доходу?", "Що буде, якщо хвороба чи травма не дадуть мені працювати кілька місяців — або назавжди?", "Чи маю я достатній фінансовий резерв для покриття зобов’язань, іпотеки та звичайних витрат?", "А якщо від мого доходу залежить родина — як довго вона фінансово впоралася б без мене?"],
    earlyKicker: "Завчасний захист", earlyTitle: "Чому варто оформити страхування життя якомога раніше?", earlyPoints: [["Чим раніше, тим вигідніше.", "З віком вартість страхування зазвичай зростає. Завчасне оформлення може дати вигідніші умови."], ["Сьогодні ви здорові. За кілька років це може змінитися.", "Перенесена хвороба чи травма згодом можуть означати вищі внески, виключення, обмежене покриття або навіть відмову у страхуванні."]], earlyConclusion: "Страхування життя найкраще вирішувати раніше, ніж воно вам справді знадобиться.",
    statisticsKicker: "Дані ЧССЗ", statisticsTitle: "Скільки отримувачів пенсії по інвалідності зареєстровано в Чехії?", paidPensions: "Виплачувані пенсії по інвалідності · станом на 31. 12. 2024", peopleReceived: "осіб отримували пенсію по інвалідності. Наприкінці 2025 року це було вже", people: "осіб", degrees: [["1-й ступінь", "Зниження працездатності на 35–49%", "9 906 Kč"], ["2-й ступінь", "Зниження працездатності на 50–69%", "11 704 Kč"], ["3-й ступінь", "Зниження працездатності на 70% і більше", "17 325 Kč"]], peopleLabel: "осіб", workCapacityDrop: "Зниження працездатності", averagePension: "Середня самостійна пенсія по інвалідності", futureQuestion: "Чи впевнені ви, що це не стосуватиметься вас у майбутньому?", source: "Джерело", countsSource: "ЧССЗ — показники за грудень 2025", averagesSource: "ЧССЗ — середні розміри пенсій по інвалідності",
    costKicker: "Інший погляд на вартість", costTitleBefore: "Страхування життя, наприклад за", costTitleAmount: "2 000 Kč на місяць", costTitleAfter: "на перший погляд може здаватися великою витратою.", costLead: "Подивімося на це інакше.", dailyPrice: "66 Kč", daily: "на день", costText: "Це сума, яку легко витратити на каву, перекус чи іншу щоденну дрібницю. Водночас вона може означати виплату в сотні тисяч або мільйони крон.",
    conclusion: "Страхування життя не запобіжить тому, що щось станеться. Але воно може суттєво пом’якшити фінансові наслідки такої ситуації.", processKicker: "Як ми діятимемо", processTitle: "Спочатку ви. Потім страхування.", processFirst: "Ми обговоримо вашу життєву ситуацію, потреби та ризики. На їх основі підберемо й налаштуємо страхування саме для вас.", processStrong: "Я поясню, що покривається, що не покривається і за яких умов.", processRest: " Потім ми порівняємо пропозицію з конкурентами, щоб ви точно знали, за що платите і чому.", meetingCta: "Домовитися про зустріч", meetingTitle: "Домовтеся про час", meetingDescription: "Залиште контактні дані, і ваш консультант незабаром вам відповість.", closeForm: "Закрити форму", submitted: "Ваш запит надіслано.", thankYou: "Дякуємо. Ми незабаром з вами зв’яжемося.", footer: "Страхування завжди налаштовується відповідно до вашої життєвої ситуації, доходів, зобов’язань і пріоритетів.",
  },
} as const;

const subscribeToLocation = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

const getEmbedSearch = () => window.location.search;
const getServerEmbedSearch = () => "";

export default function LifeInsuranceEmbedPage() {
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingSubmitted, setMeetingSubmitted] = useState(false);
  const embedSearch = useSyncExternalStore(subscribeToLocation, getEmbedSearch, getServerEmbedSearch);
  const embedParams = new URLSearchParams(embedSearch);
  const advisorSlug = embedParams.get("advisor")?.trim() ?? "";
  const theme = embedParams.get("theme") === "light" ? "light" : "dark";
  const requestedLocale = embedParams.get("locale");
  const locale: OnlineCardLocale = requestedLocale === "en" || requestedLocale === "uk" ? requestedLocale : "cs";
  const copy = LIFE_COPY[locale];
  const meetingHref = /^[a-z0-9-]+$/i.test(advisorSlug) ? `/embed/schuzka/${encodeURIComponent(advisorSlug)}` : null;
  const lightMode = theme === "light";
  const primaryTextClass = lightMode ? "text-slate-950" : "text-white";
  const bodyTextClass = lightMode ? "text-slate-600" : "text-violet-50/74";
  const labelTextClass = lightMode ? "text-fuchsia-800/75" : "text-fuchsia-100/75";

  useEffect(() => {
    if (!meetingModalOpen) return;

    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [meetingModalOpen]);

  return (
    <main className={`min-h-full overflow-x-hidden px-5 py-8 transition-colors duration-300 sm:px-10 sm:py-12 ${lightMode ? "bg-[radial-gradient(circle_at_89%_9%,rgba(217,70,239,0.14),transparent_24%),radial-gradient(circle_at_8%_42%,rgba(124,58,237,0.12),transparent_34%),linear-gradient(145deg,#fdf4ff_0%,#faf5ff_52%,#ffffff_100%)] text-slate-950" : "bg-[radial-gradient(circle_at_89%_9%,rgba(217,70,239,0.17),transparent_24%),radial-gradient(circle_at_8%_42%,rgba(124,58,237,0.17),transparent_34%),linear-gradient(145deg,#0b0717_0%,#110a22_53%,#080610_100%)] text-white"}`}>
      <article className="mx-auto max-w-[1320px]">
        <header className="relative overflow-hidden py-8 sm:py-12">
          <div className="pointer-events-none absolute right-[4%] top-0 h-72 w-72 rounded-full bg-fuchsia-400/[0.13] blur-[100px]" />
          <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.95fr)] lg:items-center lg:gap-16">
            <div className="max-w-3xl">
              <p className={`inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] ${labelTextClass}`}><HeartHandshake className="h-3.5 w-3.5" /> {copy.category}</p>
              <h1 className={`mt-4 text-4xl font-bold leading-[0.9] tracking-[-0.065em] sm:text-6xl lg:text-[5.9rem] ${primaryTextClass}`}>{copy.title}</h1>
              <p className={`mt-6 max-w-xl text-base leading-relaxed sm:text-lg ${bodyTextClass}`}>{copy.intro}</p>
            </div>

            <div className={`relative isolate mx-auto w-full max-w-[500px] overflow-hidden rounded-[2rem_2rem_2rem_0.65rem] border p-7 shadow-[0_28px_72px_rgba(23,5,35,0.28)] sm:p-9 ${lightMode ? "border-fuchsia-200/75 bg-white/72" : "border-white/[0.12] bg-white/[0.045]"}`}>
              <div className="pointer-events-none absolute inset-0 opacity-[0.19] [background-image:linear-gradient(rgba(232,121,249,0.28)_1px,transparent_1px),linear-gradient(90deg,rgba(232,121,249,0.28)_1px,transparent_1px)] [background-size:44px_44px]" />
              <Image
                src="/images/bohemkalogo.png"
                alt=""
                width={1024}
                height={1536}
                aria-hidden="true"
                className={`pointer-events-none absolute -right-8 -top-24 z-[1] h-[32rem] w-auto select-none ${lightMode ? "opacity-[0.06] mix-blend-multiply" : "opacity-[0.12] mix-blend-screen"}`}
              />
              <div className="relative">
                <span className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${lightMode ? "bg-fuchsia-100 text-fuchsia-700" : "bg-fuchsia-300/[0.12] text-fuchsia-100"}`}><HeartPulse className="h-7 w-7" /></span>
                <p className={`mt-7 text-xl font-bold leading-tight tracking-[-0.035em] sm:text-2xl ${primaryTextClass}`}>{copy.protectionTitle}</p>
                <p className={`mt-4 max-w-[36ch] text-sm leading-relaxed ${bodyTextClass}`}>{copy.protectionText}</p>
                <div className={`mt-8 grid gap-4 border-t pt-6 sm:grid-cols-3 ${lightMode ? "border-fuchsia-100" : "border-white/[0.1]"}`}>
                  {[
                    [ShieldCheck, copy.protectionFeatures[0]],
                    [WalletCards, copy.protectionFeatures[1]],
                    [UsersRound, copy.protectionFeatures[2]],
                  ].map(([Icon, label]) => {
                    const FeatureIcon = Icon as typeof ShieldCheck;
                    return <div key={label as string} className={`flex items-center gap-2 text-xs font-semibold ${lightMode ? "text-slate-700" : "text-violet-50/82"}`}><FeatureIcon className="h-4 w-4 text-fuchsia-300" />{label as string}</div>;
                  })}
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-10 py-10 lg:grid-cols-[minmax(260px,0.43fr)_minmax(0,1fr)] lg:gap-16 lg:py-14">
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><CircleHelp className="h-4 w-4" /> {copy.decisionKicker}</p>
            <h2 className={`mt-4 max-w-[12ch] text-3xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-5xl ${primaryTextClass}`}>{copy.decisionTitle}</h2>
            <p className={`mt-5 max-w-sm text-sm leading-relaxed ${bodyTextClass}`}>{copy.decisionText}</p>
          </div>

          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {copy.questions.map((question, index) => (
              <article key={question} className="group relative pl-9">
                <span className={`absolute left-0 top-0.5 text-[10px] font-bold tracking-[0.18em] ${lightMode ? "text-fuchsia-700/80" : "text-fuchsia-200/70"}`}>{String(index + 1).padStart(2, "0")}</span>
                <p className={`text-base font-semibold leading-snug tracking-[-0.02em] transition group-hover:text-fuchsia-200 sm:text-lg ${primaryTextClass}`}>{question}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`grid gap-10 py-10 lg:grid-cols-[minmax(260px,0.43fr)_minmax(0,1fr)] lg:gap-16 lg:py-14 ${lightMode ? "border-t border-fuchsia-100" : "border-t border-white/[0.08]"}`}>
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><HeartPulse className="h-4 w-4" /> {copy.earlyKicker}</p>
            <h2 className={`mt-4 max-w-[13ch] text-3xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-5xl ${primaryTextClass}`}>{copy.earlyTitle}</h2>
          </div>

          <div className="space-y-7">
            {copy.earlyPoints.map(([title, text]) => (
              <article key={title}>
                <h3 className={`text-xl font-bold tracking-[-0.03em] sm:text-2xl ${primaryTextClass}`}>{title}</h3>
                <p className={`mt-2 max-w-2xl text-base leading-relaxed ${bodyTextClass}`}>{text}</p>
              </article>
            ))}
            <p className={`max-w-2xl border-l-2 border-fuchsia-400 pl-5 text-lg font-semibold leading-relaxed tracking-[-0.02em] ${primaryTextClass}`}>{copy.earlyConclusion}</p>
          </div>
        </section>

        <section className={`relative overflow-hidden rounded-[2rem_2rem_2rem_0.65rem] p-7 sm:p-10 ${lightMode ? "bg-violet-100/65" : "bg-violet-300/[0.07]"}`}>
          <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(196,181,253,0.28)_1px,transparent_1px),linear-gradient(90deg,rgba(196,181,253,0.28)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="relative">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end">
              <div>
                <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${lightMode ? "text-violet-800/75" : "text-violet-100/75"}`}><HeartPulse className="h-4 w-4" /> {copy.statisticsKicker}</p>
                <h2 className={`mt-4 max-w-[15ch] text-3xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-5xl ${primaryTextClass}`}>{copy.statisticsTitle}</h2>
              </div>
              <div className={`rounded-[1.5rem_1.5rem_1.5rem_0.5rem] p-6 sm:p-7 ${lightMode ? "bg-white/72" : "bg-[#090614]/42"}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-violet-800/65" : "text-violet-100/60"}`}>{copy.paidPensions}</p>
                <p className={`mt-2 text-5xl font-bold tracking-[-0.07em] sm:text-6xl ${lightMode ? "text-fuchsia-700" : "text-fuchsia-200 drop-shadow-[0_0_22px_rgba(232,121,249,0.22)]"}`}>415 623</p>
                <p className={`mt-2 text-sm leading-relaxed ${bodyTextClass}`}>{copy.peopleReceived} <strong className={primaryTextClass}>418 988 {copy.people}</strong>.</p>
              </div>
            </div>

            <div className="mt-10 grid gap-7 sm:grid-cols-3">
              {copy.degrees.map(([level, range, pension], index) => (
                <article key={level}>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-fuchsia-800/75" : "text-fuchsia-100/72"}`}>{level}</p>
                  <p className={`mt-2 text-3xl font-bold tracking-[-0.055em] ${primaryTextClass}`}>{INVALIDITY_COUNTS[index]}</p>
                  <div className={`mt-1 flex items-start gap-2 text-sm leading-relaxed ${bodyTextClass}`}>
                    <span>{copy.peopleLabel} · {range}</span>
                    <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${lightMode ? "bg-rose-100 text-rose-700" : "bg-rose-300/12 text-rose-200"}`} title={copy.workCapacityDrop}>
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </div>
                  <p className={`mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] ${lightMode ? "text-violet-800/65" : "text-violet-100/60"}`}>{copy.averagePension}</p>
                  <p className={`mt-1 text-xl font-bold tracking-[-0.035em] ${lightMode ? "text-fuchsia-700" : "text-fuchsia-100"}`}>{pension}</p>
                </article>
              ))}
            </div>

            <p className={`mt-9 max-w-2xl border-l-2 border-fuchsia-400 pl-5 text-xl font-semibold leading-snug tracking-[-0.03em] sm:text-2xl ${primaryTextClass}`}>{copy.futureQuestion}</p>

            <p className={`mt-6 text-[11px] leading-relaxed ${lightMode ? "text-slate-500" : "text-violet-100/52"}`}>
              {copy.source}: <a className="underline decoration-violet-300/60 underline-offset-4 transition hover:text-fuchsia-200" href={CSSZ_COUNTS_URL} target="_blank" rel="noreferrer noopener">{copy.countsSource}</a>{" · "}<a className="underline decoration-violet-300/60 underline-offset-4 transition hover:text-fuchsia-200" href={CSSZ_AVERAGES_URL} target="_blank" rel="noreferrer noopener">{copy.averagesSource}</a>.
            </p>
          </div>
        </section>

        <section className="grid gap-8 py-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(300px,0.78fr)] lg:items-center lg:gap-16">
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><WalletCards className="h-4 w-4" /> {copy.costKicker}</p>
            <h2 className={`mt-4 max-w-3xl text-3xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-5xl ${primaryTextClass}`}>{copy.costTitleBefore} <span className={lightMode ? "text-fuchsia-700" : "text-fuchsia-200"}>{copy.costTitleAmount}</span> {copy.costTitleAfter}</h2>
            <p className={`mt-5 text-base leading-relaxed sm:text-lg ${bodyTextClass}`}>{copy.costLead}</p>
          </div>
          <div className={`relative min-h-[265px] overflow-hidden rounded-[2.35rem_2.35rem_2.35rem_0.65rem] border p-5 shadow-[0_28px_64px_rgba(23,5,35,0.24)] sm:min-h-[310px] sm:p-6 ${lightMode ? "border-fuchsia-200/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.96),rgba(250,232,255,0.74))]" : "border-fuchsia-200/[0.14] bg-[linear-gradient(135deg,rgba(232,121,249,0.13),rgba(124,58,237,0.08)_55%,rgba(255,255,255,0.025))]"}`}>
            <div className={`pointer-events-none absolute inset-5 rounded-[1.7rem_1.7rem_1.7rem_0.3rem] border ${lightMode ? "border-fuchsia-200/55" : "border-fuchsia-100/[0.08]"}`} />
            <Image
              src="/images/zivotni-pojisteni-kafe.png"
              alt=""
              width={6000}
              height={5300}
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-10 -right-24 z-[1] h-[22rem] w-auto select-none object-contain drop-shadow-[0_24px_28px_rgba(16,7,12,0.34)] sm:-bottom-8 sm:-right-28 sm:h-[29rem]"
            />
            <div className="relative z-10">
              <p className={`text-[7.5rem] font-bold leading-[0.76] tracking-[-0.09em] sm:text-[9rem] ${lightMode ? "text-fuchsia-700" : "text-fuchsia-100 drop-shadow-[0_0_28px_rgba(232,121,249,0.2)]"}`}>{copy.dailyPrice}</p>
              <p className={`text-xl font-bold tracking-[-0.04em] sm:text-2xl ${primaryTextClass}`}>{copy.daily}</p>
              <p className={`mt-5 max-w-[30ch] text-sm leading-relaxed sm:text-[15px] ${bodyTextClass}`}>{copy.costText}</p>
            </div>
          </div>
        </section>

        <section className={`relative mt-2 overflow-hidden rounded-[2rem_2rem_2rem_0.65rem] p-7 sm:p-10 ${lightMode ? "bg-fuchsia-100/72" : "bg-fuchsia-300/[0.075]"}`}>
          <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full bg-fuchsia-300/[0.18] blur-[70px]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${lightMode ? "bg-white text-fuchsia-700" : "bg-white/[0.1] text-fuchsia-100"}`}><BadgeCheck className="h-6 w-6" /></span>
            <p className={`max-w-4xl text-xl font-semibold leading-snug tracking-[-0.03em] sm:text-3xl ${primaryTextClass}`}>{copy.conclusion}</p>
          </div>
        </section>

        <section className="grid gap-6 py-12 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center sm:gap-12">
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${labelTextClass}`}><HeartHandshake className="h-4 w-4" /> {copy.processKicker}</p>
            <h2 className={`mt-4 max-w-[12ch] text-6xl font-bold leading-[0.9] tracking-[-0.065em] sm:text-[6rem] ${primaryTextClass}`}>{copy.processTitle}</h2>
          </div>
          <div className={`rounded-[1.5rem_1.5rem_1.5rem_0.5rem] p-6 sm:p-8 ${lightMode ? "bg-white/70 shadow-[0_16px_38px_rgba(88,28,135,0.07)]" : "bg-white/[0.035]"}`}>
            <p className={`text-base leading-relaxed sm:text-lg ${bodyTextClass}`}>{copy.processFirst}</p>
            <p className={`mt-5 text-base leading-relaxed sm:text-lg ${bodyTextClass}`}><strong className={primaryTextClass}>{copy.processStrong}</strong>{copy.processRest}</p>
            {meetingHref ? (
              <button
                type="button"
                onClick={() => {
                  setMeetingSubmitted(false);
                  setMeetingModalOpen(true);
                }}
                className="online-card-action relative isolate mt-7 inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/35 bg-[linear-gradient(120deg,rgba(192,38,211,0.88)_0%,rgba(168,85,247,0.78)_55%,rgba(192,132,252,0.86)_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_16px_32px_rgba(192,38,211,0.3),inset_0_1px_0_rgba(255,255,255,0.42)] transition hover:brightness-110 hover:shadow-[0_18px_36px_rgba(192,38,211,0.38)] before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-white/85 before:opacity-70"
              >
                <CalendarDays className="h-4 w-4" />
                {copy.meetingCta}
              </button>
            ) : null}
          </div>
        </section>

        <footer className={`py-7 text-[11px] leading-relaxed ${lightMode ? "text-slate-500" : "text-violet-100/52"}`}>{copy.footer}</footer>
      </article>

      {meetingModalOpen && meetingHref ? (
        <div className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-[#070512]/78 p-4 backdrop-blur-xl sm:p-6" role="dialog" aria-modal="true" aria-label={copy.meetingCta}>
          <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden rounded-[30px] border border-violet-300/25 bg-[#120a25] p-4 text-white shadow-[0_34px_100px_rgba(7,6,25,0.76),inset_0_1px_0_rgba(221,214,254,0.16)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[32px] sm:p-6">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-[90px]" />
            <div className="pointer-events-none absolute -bottom-32 left-1/4 h-48 w-80 rounded-full bg-indigo-500/10 blur-[80px]" />
            <div className="relative flex shrink-0 items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-200/25 bg-fuchsia-400/15 text-fuchsia-100 shadow-[0_10px_24px_rgba(192,38,211,0.24)]">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-200/80">{copy.meetingCta}</p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-0.035em] text-white sm:text-2xl">{copy.meetingTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-violet-100/70">{copy.meetingDescription}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMeetingModalOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-violet-100 transition hover:rotate-90 hover:bg-white/[0.14]"
                aria-label={copy.closeForm}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative max-h-[calc(100dvh-11rem)] overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {meetingSubmitted ? (
                <div className="mt-6 rounded-2xl border border-emerald-300/35 bg-emerald-400/14 px-4 py-4 text-emerald-50">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{copy.submitted}</p>
                      <p className="mt-1 text-sm text-emerald-50/82">{copy.thankYou}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <OnlineCardMeetingStepper
                  slug={advisorSlug}
                  locale={locale}
                  initialSelectedTopics={["life-accident"]}
                  initialStep={1}
                  onSubmitted={() => setMeetingSubmitted(true)}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
