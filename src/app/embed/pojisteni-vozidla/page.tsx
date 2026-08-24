"use client";

import {
  AlertTriangle,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  CloudLightning,
  Gauge,
  KeyRound,
  LifeBuoy,
  MapPin,
  PawPrint,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";

const GLASS_SOURCE_URL =
  "https://www.koop.cz/pojisteni/pojisteni-vozidel/pojisteni-automobilu/skla";
const WILDLIFE_SOURCE_URL =
  "https://www.generaliceska.cz/-/srna-index-v-nove-podobe-na-ceskych-silnicich-eviduje-historicky-nejvice-srazene-zvere";

const VEHICLE_COPY = {
  cs: {
    category: "Pojištění vozidel",
    heroTitle: "Povinné ručení chrání ostatní.",
    heroAccent: "Kdo ochrání vaše auto?",
    heroLead:
      "Dobré autopojištění se nepozná podle nejnižší ceny, ale podle toho, co se stane po prasklém skle, vlastní chybě nebo poruše stovky kilometrů od domova.",
    heroCta: "Zjistit, co má smysl krýt",
    factGlassValue: "Každá čtvrtá škoda na autě je poškozené čelní sklo.",
    factGlassLabel: "",
    factWildlifeValue: "18 112",
    factWildlifeLabel: "evidovaných střetů se zvěří od října 2025 do března 2026",
    source: "Zdroj",
    coverageKicker: "Co řeší samotné povinné ručení",
    coverageTitle: "Zákonná povinnost není totéž co ochrana vlastního auta.",
    coverageLead:
      "Povinné ručení hradí újmu, kterou provozem vozidla způsobíte ostatním. Pro vlastní vůz je potřeba zvolit odpovídající havarijní pojištění nebo připojištění.",
    coverageHeadEvent: "Co se stalo",
    coverageHeadBase: "Samotné povinné ručení",
    coverageHeadBetter: "Dobře nastavené krytí",
    coverageRows: [
      ["Způsobíte škodu jinému", "Kryje škodu poškozeného", "Dostatečný limit odpovědnosti"],
      ["Poškodíte vlastní auto", "Vlastní škodu nekryje", "Havarijní pojištění"],
      ["Kamínek poškodí sklo", "Bez připojištění nekryje", "Skla s reálným limitem"],
      ["Střetnete se se zvířetem", "Vlastní škodu nekryje", "Střet se zvířetem nebo havarijní"],
      ["Porucha daleko od domova", "Jen dle rozsahu asistence", "Odtah, oprava, náhradní vůz"],
    ],
    protectionKicker: "Čtyři místa, kde rozhodují podmínky",
    protectionTitle: "Nejde o více připojištění. Jde o správná připojištění.",
    protectionCards: [
      ["Havarijní pojištění", "Chrání hodnotu vašeho auta při vlastní chybě, vandalismu, odcizení nebo živlu podle sjednaného rozsahu.", "Důležitá je hodnota vozu, spoluúčast a rozsah rizik — ne pouze jeho stáří."],
      ["Skla", "Limit musí odpovídat skutečné ceně skla, montáže a případné kalibrace kamer a senzorů.", "Ověřte, zda jsou kryta všechna výhledová skla, panoramatická střecha i zrcátka."],
      ["Střet a poškození zvířetem", "Střet se zvířetem a poškození zaparkovaného vozu zvířetem mohou být dvě rozdílná rizika.", "Nestačí jen název připojištění — rozhoduje definice události a limit."],
      ["Asistenční služby", "Telefonní číslo na kartičce ještě neznamená, že máte odtah tam, kam potřebujete.", "Porovnávejte limity, územní platnost a pomoc po poruše, nehodě i chybě řidiče."],
    ],
    assistanceKicker: "Asistence, která opravdu pomůže",
    assistanceTitle: "Neptáme se, zda asistenci máte. Ptáme se, kam až vás dostane.",
    assistanceLead:
      "Základní varianta může stačit ve městě. Na dálnici nebo v zahraničí ale rozhodují konkrétní kilometry, finanční limity a navazující pomoc.",
    assistanceItems: [
      "oprava vozidla na místě",
      "odtah bez nízkého kilometrového limitu",
      "náhradní vozidlo po dobu opravy",
      "ubytování nebo pokračování v cestě",
      "repatriace vozidla ze zahraničí",
      "pomoc při defektu, záměně paliva či ztrátě klíčů",
    ],
    assistanceQuestion: "Víte, kolik kilometrů odtahu vaše smlouva skutečně zaplatí?",
    setupKicker: "Jak pojištění nastavíme",
    setupTitle: "Nejdříve auto a váš provoz. Potom nabídka.",
    setupText:
      "Zohledníme hodnotu a stáří auta, roční nájezd, způsob parkování, řidiče, cesty do zahraničí i částku, kterou jste ochotni nést sami.",
    setupStrong:
      "Porovnáme nejen cenu, ale také limity, spoluúčast, výluky, servisní síť a skutečný rozsah asistence.",
    meetingCta: "Zkontrolovat moje autopojištění",
    meetingTitle: "Podíváme se na vaše auto",
    meetingDescription: "Nechte na sebe kontakt a společně zkontrolujeme, kde má smlouva silná a slabá místa.",
    closeForm: "Zavřít formulář",
    submitted: "Žádost byla odeslána.",
    thankYou: "Děkujeme, brzy se vám ozveme.",
    footer:
      "Konkrétní rozsah krytí, limity, výluky a spoluúčast se vždy řídí pojistnou smlouvou a pojistnými podmínkami vybraného produktu.",
  },
  en: {
    category: "Vehicle insurance",
    heroTitle: "Liability insurance protects others.",
    heroAccent: "Who protects your car?",
    heroLead:
      "Good vehicle insurance is not defined by the lowest price, but by what happens after cracked glass, an at-fault accident or a breakdown hundreds of kilometres from home.",
    heroCta: "See what is worth covering",
    factGlassValue: "Every fourth vehicle claim involves a damaged windscreen.",
    factGlassLabel: "",
    factWildlifeValue: "18,112",
    factWildlifeLabel: "recorded wildlife collisions from October 2025 to March 2026",
    source: "Source",
    coverageKicker: "What compulsory liability covers",
    coverageTitle: "A legal obligation is not the same as protecting your own car.",
    coverageLead:
      "Liability insurance pays for harm you cause to others while operating the vehicle. Your own car needs suitable comprehensive or additional cover.",
    coverageHeadEvent: "What happened",
    coverageHeadBase: "Liability only",
    coverageHeadBetter: "Well-arranged cover",
    coverageRows: [
      ["You damage someone else's property", "Covers the injured party", "An adequate liability limit"],
      ["You damage your own car", "Does not cover your loss", "Comprehensive insurance"],
      ["A stone damages the glass", "Not without extra cover", "Glass cover with a realistic limit"],
      ["You collide with an animal", "Does not cover your car", "Animal collision or comprehensive cover"],
      ["You break down far from home", "Only within assistance limits", "Recovery, repair and replacement car"],
    ],
    protectionKicker: "Four areas where the terms matter",
    protectionTitle: "It is not about more add-ons. It is about the right ones.",
    protectionCards: [
      ["Comprehensive insurance", "Protects the value of your car after an at-fault accident, vandalism, theft or natural event, depending on the selected scope.", "The car's value, excess and covered risks matter more than age alone."],
      ["Glass", "The limit should reflect the real cost of the glass, installation and calibration of cameras and sensors.", "Check whether all windows, the panoramic roof and mirrors are covered."],
      ["Animal collision and damage", "A collision with an animal and animal damage to a parked car may be two different insured risks.", "The event definition and limit matter more than the add-on's name."],
      ["Roadside assistance", "A phone number on your card does not guarantee recovery to where you need to go.", "Compare limits, territorial scope and help after breakdowns, accidents and driver errors."],
    ],
    assistanceKicker: "Assistance that actually helps",
    assistanceTitle: "We do not ask whether you have assistance. We ask how far it gets you.",
    assistanceLead:
      "Basic assistance may be enough in town. On a motorway or abroad, mileage, financial limits and onward support become decisive.",
    assistanceItems: [
      "repair at the roadside",
      "recovery without a low mileage cap",
      "replacement car during repairs",
      "accommodation or continuation of the journey",
      "vehicle repatriation from abroad",
      "help with a puncture, wrong fuel or lost keys",
    ],
    assistanceQuestion: "Do you know how many recovery kilometres your policy will actually pay for?",
    setupKicker: "How we arrange the cover",
    setupTitle: "Your car and its use first. The offer second.",
    setupText:
      "We consider the vehicle's value and age, annual mileage, parking, drivers, travel abroad and the loss you are prepared to bear yourself.",
    setupStrong:
      "We compare not only price, but also limits, excess, exclusions, repair networks and the real assistance scope.",
    meetingCta: "Review my vehicle insurance",
    meetingTitle: "Let us look at your car",
    meetingDescription: "Leave your details and we will review the strong and weak points of your current policy.",
    closeForm: "Close form",
    submitted: "Your request has been sent.",
    thankYou: "Thank you. We will be in touch soon.",
    footer:
      "The exact scope, limits, exclusions and excess are always governed by the policy and terms of the selected insurance product.",
  },
  uk: {
    category: "Страхування автомобіля",
    heroTitle: "Обов’язкове страхування захищає інших.",
    heroAccent: "А хто захистить ваше авто?",
    heroLead:
      "Якісне страхування визначає не найнижча ціна, а те, що станеться після тріщини на склі, аварії з вашої вини або поломки за сотні кілометрів від дому.",
    heroCta: "Дізнатися, що варто покрити",
    factGlassValue: "Кожна четверта страхова подія з авто — пошкоджене лобове скло.",
    factGlassLabel: "",
    factWildlifeValue: "18 112",
    factWildlifeLabel: "зафіксованих зіткнень із тваринами з жовтня 2025 до березня 2026 року",
    source: "Джерело",
    coverageKicker: "Що покриває обов’язкове страхування",
    coverageTitle: "Виконати вимогу закону — не те саме, що захистити власне авто.",
    coverageLead:
      "Страхування відповідальності відшкодовує збитки, завдані іншим. Для власного автомобіля потрібне відповідне каско або додаткове покриття.",
    coverageHeadEvent: "Що сталося",
    coverageHeadBase: "Лише автоцивілка",
    coverageHeadBetter: "Правильно налаштований захист",
    coverageRows: [
      ["Ви завдали шкоди іншому", "Покриває збиток потерпілого", "Достатній ліміт відповідальності"],
      ["Ви пошкодили власне авто", "Не покриває ваш збиток", "Каско"],
      ["Камінь пошкодив скло", "Не покриває без доповнення", "Скло з реальним лімітом"],
      ["Ви зіткнулися з твариною", "Не покриває ваше авто", "Зіткнення з твариною або каско"],
      ["Поломка далеко від дому", "Лише в межах асистансу", "Евакуація, ремонт і підмінне авто"],
    ],
    protectionKicker: "Чотири місця, де важливі умови",
    protectionTitle: "Не більше доповнень, а правильні доповнення.",
    protectionCards: [
      ["Каско", "Захищає вартість авто при аварії з вашої вини, вандалізмі, викраденні або стихії відповідно до обраного покриття.", "Вартість авто, франшиза та ризики важливіші, ніж лише його вік."],
      ["Скло", "Ліміт має відповідати реальній ціні скла, монтажу та калібрування камер і датчиків.", "Перевірте покриття всіх вікон, панорамного даху та дзеркал."],
      ["Зіткнення і пошкодження твариною", "Зіткнення з твариною та пошкодження припаркованого авто можуть бути різними ризиками.", "Вирішальними є визначення події та ліміт, а не лише назва доповнення."],
      ["Допомога в дорозі", "Номер телефону на картці ще не гарантує евакуацію туди, куди вам потрібно.", "Порівнюйте ліміти, територію та допомогу після поломки, аварії чи помилки водія."],
    ],
    assistanceKicker: "Допомога, яка справді працює",
    assistanceTitle: "Ми питаємо не чи є асистанс, а як далеко він вас довезе.",
    assistanceLead:
      "Базового варіанта може вистачити в місті. На автомагістралі чи за кордоном вирішують кілометри, фінансові ліміти та подальша допомога.",
    assistanceItems: [
      "ремонт автомобіля на місці",
      "евакуація без низького ліміту кілометрів",
      "підмінне авто на час ремонту",
      "проживання або продовження подорожі",
      "репатріація автомобіля з-за кордону",
      "допомога при проколі, неправильному пальному чи втраті ключів",
    ],
    assistanceQuestion: "Чи знаєте ви, скільки кілометрів евакуації реально оплатить ваш поліс?",
    setupKicker: "Як ми налаштуємо страхування",
    setupTitle: "Спочатку авто і ваші поїздки. Потім пропозиція.",
    setupText:
      "Врахуємо вартість і вік авто, річний пробіг, паркування, водіїв, поїздки за кордон і суму, яку ви готові покрити самостійно.",
    setupStrong:
      "Порівняємо не лише ціну, а й ліміти, франшизу, винятки, мережу сервісів і реальний обсяг допомоги.",
    meetingCta: "Перевірити моє страхування авто",
    meetingTitle: "Розглянемо ваше авто",
    meetingDescription: "Залиште контакти, і ми разом перевіримо сильні та слабкі місця вашого поліса.",
    closeForm: "Закрити форму",
    submitted: "Запит надіслано.",
    thankYou: "Дякуємо, незабаром ми з вами зв’яжемося.",
    footer:
      "Точний обсяг покриття, ліміти, винятки та франшиза завжди визначаються договором і умовами обраного страхового продукту.",
  },
} as const;

const PROTECTION_ICONS = [ShieldCheck, ScanLine, PawPrint, LifeBuoy] as const;

const subscribeToLocation = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

const getEmbedSearch = () => window.location.search;
const getServerEmbedSearch = () => "";

export default function VehicleInsuranceEmbedPage() {
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingSubmitted, setMeetingSubmitted] = useState(false);
  const embedSearch = useSyncExternalStore(
    subscribeToLocation,
    getEmbedSearch,
    getServerEmbedSearch
  );
  const embedParams = new URLSearchParams(embedSearch);
  const advisorSlug = embedParams.get("advisor")?.trim() ?? "";
  const theme = embedParams.get("theme") === "light" ? "light" : "dark";
  const requestedLocale = embedParams.get("locale");
  const locale: OnlineCardLocale =
    requestedLocale === "en" || requestedLocale === "uk" ? requestedLocale : "cs";
  const copy = VEHICLE_COPY[locale];
  const lightMode = theme === "light";
  const hasAdvisor = /^[a-z0-9-]+$/i.test(advisorSlug);
  const primaryTextClass = lightMode ? "text-slate-950" : "text-white";
  const bodyTextClass = lightMode ? "text-slate-600" : "text-blue-100/72";
  const panelClass = lightMode
    ? "border-slate-200/90 bg-white/86 shadow-[0_24px_64px_rgba(15,23,42,0.1)]"
    : "border-white/[0.1] bg-[#07162f]/76 shadow-[0_28px_80px_rgba(2,8,23,0.34)]";

  useEffect(() => {
    if (!meetingModalOpen) return;

    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMeetingModalOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [meetingModalOpen]);

  const openMeeting = () => {
    if (!hasAdvisor) return;
    setMeetingSubmitted(false);
    setMeetingModalOpen(true);
  };

  return (
    <main
      className={`relative min-h-screen overflow-hidden transition-colors ${
        lightMode
          ? "bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_46%,#ffffff_100%)]"
          : "bg-[radial-gradient(circle_at_78%_2%,rgba(14,165,233,0.2),transparent_30%),linear-gradient(180deg,#030b18_0%,#07162f_48%,#030914_100%)]"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(96,165,250,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(96,165,250,0.2)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_54%)]" />

      <article className="relative mx-auto max-w-[1500px] px-4 pb-8 pt-8 sm:px-8 sm:pb-12 sm:pt-14 lg:px-12">
        <section className="flex min-h-[520px] items-center py-10 sm:min-h-[590px] sm:py-16">
          <div className="relative z-10 max-w-5xl">
            <p
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] ${
                lightMode
                  ? "border-blue-200 bg-white/85 text-blue-800"
                  : "border-cyan-200/30 bg-white/[0.05] text-cyan-100"
              }`}
            >
              <CarFront className="h-4 w-4" />
              {copy.category}
            </p>
            <h1
              className={`mt-6 max-w-[15ch] text-5xl font-extrabold leading-[0.92] tracking-[-0.065em] sm:text-7xl lg:text-[5.8rem] ${primaryTextClass}`}
            >
              {copy.heroTitle}{" "}
              <span className={lightMode ? "text-blue-700" : "text-cyan-300"}>
                {copy.heroAccent}
              </span>
            </h1>
            <p className={`mt-7 max-w-3xl text-base leading-relaxed sm:text-lg ${bodyTextClass}`}>
              {copy.heroLead}
            </p>
            <a
              href="#coverage"
              className="online-card-action mt-8 inline-flex items-center gap-2 rounded-full border border-white/30 bg-[linear-gradient(120deg,#1d4ed8_0%,#2563eb_55%,#06b6d4_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:-translate-y-0.5 hover:brightness-110"
            >
              <Gauge className="h-4 w-4" />
              {copy.heroCta}
            </a>
          </div>
        </section>

        <section className="grid gap-4 py-10 sm:grid-cols-2 sm:py-14">
          {[
            [copy.factGlassValue, copy.factGlassLabel, GLASS_SOURCE_URL],
            [copy.factWildlifeValue, copy.factWildlifeLabel, WILDLIFE_SOURCE_URL],
          ].map(([value, label, sourceUrl]) => (
            <div key={value} className={`relative overflow-hidden rounded-[28px] border p-6 sm:p-8 ${panelClass}`}>
              <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-cyan-400/12 blur-[60px]" />
              <p className={`relative text-4xl font-extrabold leading-[1.02] tracking-[-0.055em] sm:text-5xl ${primaryTextClass}`}>{value}</p>
              {label ? (
                <p className={`relative mt-2 max-w-[34ch] text-sm leading-relaxed ${bodyTextClass}`}>{label}</p>
              ) : null}
              <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className={`relative mt-4 inline-flex text-[10px] font-bold uppercase tracking-[0.16em] underline underline-offset-4 ${lightMode ? "text-blue-700" : "text-cyan-200/70"}`}>
                {copy.source}
              </a>
            </div>
          ))}
        </section>

        <section id="coverage" className="scroll-mt-6 py-14 sm:py-20">
          <div className="max-w-4xl">
            <p className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] ${lightMode ? "text-blue-700" : "text-cyan-200/75"}`}>
              <ShieldCheck className="h-4 w-4" />
              {copy.coverageKicker}
            </p>
            <h2 className={`mt-4 text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl ${primaryTextClass}`}>{copy.coverageTitle}</h2>
            <p className={`mt-5 max-w-3xl text-base leading-relaxed ${bodyTextClass}`}>{copy.coverageLead}</p>
          </div>

          <div className={`mt-9 overflow-hidden rounded-[28px] border ${panelClass}`}>
            <div className={`hidden grid-cols-[1.15fr_1fr_1fr] border-b px-6 py-4 text-[10px] font-bold uppercase tracking-[0.17em] md:grid ${lightMode ? "border-slate-200 text-slate-500" : "border-white/10 text-blue-100/55"}`}>
              <span>{copy.coverageHeadEvent}</span>
              <span>{copy.coverageHeadBase}</span>
              <span>{copy.coverageHeadBetter}</span>
            </div>
            {copy.coverageRows.map((row, index) => (
              <div key={row[0]} className={`grid gap-3 border-b px-5 py-5 last:border-b-0 md:grid-cols-[1.15fr_1fr_1fr] md:items-center md:px-6 ${lightMode ? "border-slate-200" : "border-white/[0.08]"}`}>
                <p className={`text-sm font-bold ${primaryTextClass}`}>{row[0]}</p>
                <p className={`flex items-start gap-2 text-sm ${bodyTextClass}`}>
                  {index === 0 ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  {row[1]}
                </p>
                <p className={`flex items-start gap-2 text-sm font-semibold ${lightMode ? "text-blue-800" : "text-cyan-100"}`}>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {row[2]}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-14 sm:py-20">
          <div className="text-center">
            <p className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] ${lightMode ? "text-blue-700" : "text-cyan-200/75"}`}>
              <Sparkles className="h-4 w-4" />
              {copy.protectionKicker}
            </p>
            <h2 className={`mx-auto mt-4 max-w-[17ch] text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl ${primaryTextClass}`}>{copy.protectionTitle}</h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {copy.protectionCards.map((card, index) => {
              const Icon = PROTECTION_ICONS[index];
              return (
                <div key={card[0]} className={`group relative overflow-hidden rounded-[30px_30px_10px_30px] border p-6 transition hover:-translate-y-1 sm:p-8 ${panelClass}`}>
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_94%_6%,rgba(14,165,233,0.14),transparent_32%)]" />
                  <span className={`relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${lightMode ? "border-blue-200 bg-blue-50 text-blue-700" : "border-cyan-200/20 bg-cyan-400/10 text-cyan-200"}`}>
                    <Icon className="h-6 w-6" strokeWidth={1.7} />
                  </span>
                  <h3 className={`relative mt-5 text-2xl font-bold tracking-[-0.035em] ${primaryTextClass}`}>{card[0]}</h3>
                  <p className={`relative mt-3 text-sm leading-relaxed ${bodyTextClass}`}>{card[1]}</p>
                  <p className={`relative mt-5 border-l-2 border-cyan-400/55 pl-4 text-sm font-semibold leading-relaxed ${lightMode ? "text-slate-800" : "text-blue-50"}`}>{card[2]}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-8 py-14 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] ${lightMode ? "text-blue-700" : "text-cyan-200/75"}`}>
              <LifeBuoy className="h-4 w-4" />
              {copy.assistanceKicker}
            </p>
            <h2 className={`mt-4 text-4xl font-bold leading-[0.96] tracking-[-0.055em] sm:text-6xl ${primaryTextClass}`}>{copy.assistanceTitle}</h2>
            <p className={`mt-5 text-base leading-relaxed ${bodyTextClass}`}>{copy.assistanceLead}</p>
            <div className={`mt-7 flex items-start gap-3 rounded-2xl border p-4 ${lightMode ? "border-amber-200 bg-amber-50 text-amber-950" : "border-amber-300/20 bg-amber-300/[0.08] text-amber-50"}`}>
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <p className="text-sm font-bold leading-relaxed">{copy.assistanceQuestion}</p>
            </div>
          </div>

          <div className={`relative overflow-hidden rounded-[34px_34px_12px_34px] border p-6 sm:p-8 ${panelClass}`}>
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-500/16 blur-[72px]" />
            <div className="relative grid gap-3 sm:grid-cols-2">
              {copy.assistanceItems.map((item, index) => {
                const icons = [Wrench, MapPin, CarFront, LifeBuoy, CloudLightning, KeyRound] as const;
                const Icon = icons[index];
                return (
                  <div key={item} className={`flex items-start gap-3 rounded-2xl border p-4 ${lightMode ? "border-slate-200 bg-slate-50/80" : "border-white/[0.08] bg-white/[0.03]"}`}>
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${lightMode ? "text-blue-700" : "text-cyan-300"}`} strokeWidth={1.8} />
                    <p className={`text-sm font-semibold leading-relaxed ${primaryTextClass}`}>{item}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-8 py-14 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] ${lightMode ? "text-blue-700" : "text-cyan-200/75"}`}>
              <CarFront className="h-4 w-4" />
              {copy.setupKicker}
            </p>
            <h2 className={`mt-4 text-5xl font-bold leading-[0.92] tracking-[-0.06em] sm:text-7xl ${primaryTextClass}`}>{copy.setupTitle}</h2>
          </div>

          <div className={`rounded-[30px_30px_30px_10px] border p-6 sm:p-8 ${panelClass}`}>
            <p className={`text-base leading-relaxed sm:text-lg ${bodyTextClass}`}>{copy.setupText}</p>
            <p className={`mt-5 text-base font-semibold leading-relaxed sm:text-lg ${primaryTextClass}`}>{copy.setupStrong}</p>
            {hasAdvisor ? (
              <button
                type="button"
                onClick={openMeeting}
                className="online-card-action mt-7 inline-flex items-center gap-2 rounded-full border border-white/30 bg-[linear-gradient(120deg,#1d4ed8_0%,#2563eb_55%,#06b6d4_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:-translate-y-0.5 hover:brightness-110"
              >
                <CalendarDays className="h-4 w-4" />
                {copy.meetingCta}
              </button>
            ) : null}
          </div>
        </section>

        <footer className={`border-t py-7 text-[11px] leading-relaxed ${lightMode ? "border-slate-200 text-slate-500" : "border-white/[0.08] text-blue-100/50"}`}>
          {copy.footer}
        </footer>
      </article>

      {meetingModalOpen && hasAdvisor ? (
        <div className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-[#020713]/82 p-4 backdrop-blur-xl sm:p-6" role="dialog" aria-modal="true" aria-label={copy.meetingCta}>
          <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-hidden rounded-[30px] border border-blue-300/25 bg-[#06152c] p-4 text-white shadow-[0_34px_100px_rgba(2,8,23,0.8),inset_0_1px_0_rgba(191,219,254,0.16)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[32px] sm:p-6">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-500/20 blur-[90px]" />
            <div className="relative flex shrink-0 items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-200/25 bg-blue-400/15 text-blue-100 shadow-[0_10px_24px_rgba(37,99,235,0.28)]">
                  <CarFront className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200/80">{copy.meetingCta}</p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-0.035em] text-white sm:text-2xl">{copy.meetingTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-blue-100/70">{copy.meetingDescription}</p>
                </div>
              </div>
              <button type="button" onClick={() => setMeetingModalOpen(false)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-blue-100 transition hover:rotate-90 hover:bg-white/[0.14]" aria-label={copy.closeForm}>
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
                <OnlineCardMeetingStepper slug={advisorSlug} locale={locale} initialSelectedTopics={["vehicle"]} initialStep={1} onSubmitted={() => setMeetingSubmitted(true)} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
