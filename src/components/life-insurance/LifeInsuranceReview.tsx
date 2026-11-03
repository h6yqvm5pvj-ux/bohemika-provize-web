"use client";

import { ArrowUpRight } from "lucide-react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import styles from "./lifeInsuranceReview.module.css";

const SOURCES = {
  cancer: "https://www.generaliceska.cz/documents/20183/97653/bel-mondo-20-riziko.pdf/fb768c41-a5b2-4aab-b8c3-67ec0e231a57#page=23",
  sickLeave: "https://www.generaliceska.cz/documents/20183/131096/denni-davky-pracovni-neschopnosti-zpps-052005.pdf/60b0eb3c-a0b1-4a4f-a7b6-7a209b7d3447",
  work: "https://www.cssz.gov.cz/web/cz/duchody-snadne-a-prehledne",
};

const COPY = {
  cs: {
    kicker: "Kontrola stávající smlouvy",
    title: "Máte pojištění. Skvělé.",
    accent: "Víte, co opravdu kryje?",
    intro: "Jste si na 100 % jistí, že vaše smlouva odpovídá tomu, co dnes potřebujete? Název produktu a měsíční platba ještě neříkají, kdy a kolik pojišťovna skutečně vyplatí.",
    examples: [
      ["Rakovina už v časné fázi?", "Některé produkty kryjí vybrané časné nebo neinvazivní nádory jen částečně, jiné je z daného připojištění vylučují. Prověřím přesné definice a výši plnění ve vaší smlouvě."],
      ["Pracovní neschopnost při invaliditě?", "U některých smluv může přiznání invalidního důchodu znamenat zánik připojištění pracovní neschopnosti, i když člověk může dál pracovat. Prověřím, co se stane s vaším krytím."],
    ],
    conditions: "Rozsah krytí závisí na konkrétní smlouvě, její variantě a pojistných podmínkách.",
    sources: "Podklady k uvedeným příkladům",
    sourceLabels: ["Generali: závažná onemocnění, Bel Mondo 20 (10/2026)", "Generali: starší podmínky pracovní neschopnosti (05/2005)", "ČSSZ: práce při pobírání invalidního důchodu"],
    methodKicker: "Důkladně. Srozumitelně. Pro vás.",
    methodTitle: "Vaši smlouvu projdu do detailu.",
    methodIntro: "Prověřím podmínky i nastavení pojištění. Vysvětlím, jak smlouva funguje, co musí být splněno pro výplatu a kdy může být plnění omezené nebo vyloučené.",
    checks: [
      ["Potřebná rizika", "Máte pojištěné situace, které mohou nejvíce zasáhnout váš život a příjem?"],
      ["Pojistné částky", "Odpovídají vašim příjmům, závazkům, rezervám a potřebám rodiny?"],
      ["Podmínky a výluky", "Jaké definice, čekací doby a limity mohou ovlivnit výplatu?"],
      ["Váš dnešní život", "Zohledňuje smlouva změny práce, rodiny, bydlení nebo zdravotního stavu?"],
    ],
    outcomeKicker: "Jasno ve vlastním pojištění",
    outcomeTitle: "Budete vědět, za co platíte.",
    outcomeText: "Společně vyhodnotíme, co funguje a co potřebuje změnu. Připravíme řešení přizpůsobené vašemu životu i rozpočtu, jehož možnosti a hranice budete znát. Případné úpravy navrhneme podle vaší aktuální situace a návaznosti pojistné ochrany.",
    cta: "Zkontrolovat moji smlouvu",
  },
  en: {
    kicker: "Review your existing policy",
    title: "You have insurance. Great.",
    accent: "Do you know what it covers?",
    intro: "Are you 100% sure your policy meets your needs today? A product name and monthly premium do not tell you when an insurer will pay or how much.",
    examples: [
      ["Cancer at an early stage?", "Some products provide only partial benefits for selected early-stage or non-invasive tumours; others exclude them from the relevant cover. I will check the precise definitions and benefits in your policy."],
      ["Sick-leave cover after disability?", "Under some policies, receiving a disability pension can end sick-leave cover even if a person can still work. I will check what happens to your cover."],
    ],
    conditions: "The scope of cover depends on the individual policy, its options and insurance terms.",
    sources: "Sources for these examples",
    sourceLabels: ["Generali: critical illnesses, Bel Mondo 20 (10/2026)", "Generali: older sick-leave terms (05/2005)", "CSSA: working while receiving a disability pension"],
    methodKicker: "Thorough. Clear. For you.",
    methodTitle: "I will review your policy in detail.",
    methodIntro: "I will check the terms and how your insurance is arranged. I will explain how the policy works, what is required for a claim and when benefits may be limited or unavailable.",
    checks: [
      ["Relevant risks", "Does your insurance cover situations that could most affect your life and income?"],
      ["Insured amounts", "Do they reflect your income, commitments, savings and family's needs?"],
      ["Terms and exclusions", "Which definitions, waiting periods and limits could affect a claim?"],
      ["Your life today", "Does the policy reflect changes in work, family, housing or health?"],
    ],
    outcomeKicker: "Understand your own insurance",
    outcomeTitle: "Know what you are paying for.",
    outcomeText: "Together, we will assess what works and what needs to change. We will develop a solution suited to your life and budget, with benefits and limits you understand. Any proposed adjustments will take account of your current circumstances and continuity of cover.",
    cta: "Review my policy",
  },
  uk: {
    kicker: "Перевірка чинного договору",
    title: "У вас є страхування. Чудово.",
    accent: "Чи знаєте ви, що воно покриває?",
    intro: "Чи впевнені ви на 100 %, що ваш договір відповідає вашим нинішнім потребам? Назва продукту та щомісячний внесок ще не пояснюють, коли й скільки страхова компанія виплатить.",
    examples: [
      ["Рак уже на ранній стадії?", "Деякі продукти передбачають лише часткову виплату за окремі ранні або неінвазивні пухлини, інші виключають їх із відповідного покриття. Я перевірю точні визначення та розмір виплат у вашому договорі."],
      ["Непрацездатність після встановлення інвалідності?", "За деякими договорами призначення пенсії по інвалідності може припинити додаткове страхування тимчасової непрацездатності, навіть якщо людина ще може працювати. Я перевірю, що станеться з вашим покриттям."],
    ],
    conditions: "Обсяг покриття залежить від конкретного договору, обраного варіанта та умов страхування.",
    sources: "Джерела наведених прикладів",
    sourceLabels: ["Generali: тяжкі захворювання, Bel Mondo 20 (10/2026)", "Generali: попередні умови непрацездатності (05/2005)", "ČSSZ: робота під час отримання пенсії по інвалідності"],
    methodKicker: "Ретельно. Зрозуміло. Для вас.",
    methodTitle: "Я детально перевірю ваш договір.",
    methodIntro: "Я перевірю умови та налаштування страхування. Поясню, як працює договір, що потрібно для виплати й коли вона може бути обмежена або не передбачена.",
    checks: [
      ["Потрібні ризики", "Чи застраховані ситуації, що можуть найбільше вплинути на ваше життя й доходи?"],
      ["Страхові суми", "Чи відповідають вони вашим доходам, зобов’язанням, заощадженням і потребам родини?"],
      ["Умови та виключення", "Які визначення, періоди очікування й ліміти можуть вплинути на виплату?"],
      ["Ваше життя сьогодні", "Чи враховує договір зміни роботи, родини, житла або стану здоров’я?"],
    ],
    outcomeKicker: "Ясність у власному страхуванні",
    outcomeTitle: "Ви знатимете, за що платите.",
    outcomeText: "Разом визначимо, що працює добре, а що потребує змін. Підготуємо рішення відповідно до вашого життя й бюджету, можливості та межі якого вам зрозумілі. Можливі зміни враховуватимуть вашу поточну ситуацію та безперервність страхового покриття.",
    cta: "Перевірити мій договір",
  },
} as const;

type LifeInsuranceReviewProps = {
  locale: OnlineCardLocale;
  onReview?: (trigger: HTMLButtonElement) => void;
};

export function LifeInsuranceReview({ locale, onReview }: LifeInsuranceReviewProps) {
  const copy = COPY[locale];

  return <>
    <section data-life-enter="" className={styles.intro} aria-labelledby="life-review-title">
      <p className={styles.kicker}><span aria-hidden="true">01</span>{copy.kicker}</p>
      <h2 id="life-review-title" className={styles.title}><span>{copy.title}</span>{" "}<em>{copy.accent}</em></h2>
      <p className={styles.lead}>{copy.intro}</p>
      <div className={styles.examples}>
        {copy.examples.map(([title, text], index) => <article key={title} className={styles.example}>
          <span className={styles.exampleNumber} aria-hidden="true">0{index + 1}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>)}
      </div>
      <p className={styles.conditions}>{copy.conditions}</p>
      <details className={styles.sources}>
        <summary>{copy.sources}</summary>
        <ul>{Object.values(SOURCES).map((href, index) => <li key={href}>
          <a href={href} target="_blank" rel="noreferrer noopener">{copy.sourceLabels[index]}<ArrowUpRight aria-hidden="true" /></a>
        </li>)}</ul>
      </details>
    </section>

    <section data-life-enter="" className={styles.method} aria-labelledby="life-review-method-title">
      <div className={styles.methodHead}>
        <p className={styles.kicker}><span aria-hidden="true">02</span>{copy.methodKicker}</p>
        <h2 id="life-review-method-title" className={styles.methodTitle}>{copy.methodTitle}</h2>
        <p className={styles.body}>{copy.methodIntro}</p>
      </div>
      <ol className={styles.checks}>
        {copy.checks.map(([title, text], index) => <li key={title}>
          <span className={styles.checkNumber} aria-hidden="true">0{index + 1}</span>
          <div><h3>{title}</h3><p>{text}</p></div>
        </li>)}
      </ol>
    </section>

    <section data-life-enter="" className={styles.outcome} aria-labelledby="life-review-outcome-title">
      <div>
        <p className={styles.kicker}><span aria-hidden="true">03</span>{copy.outcomeKicker}</p>
        <h2 id="life-review-outcome-title" className={styles.outcomeTitle}>{copy.outcomeTitle}</h2>
      </div>
      <div className={styles.outcomeBody}>
        <p className={styles.body}>{copy.outcomeText}</p>
        {onReview ? <button type="button" className={styles.cta} aria-haspopup="dialog" onClick={event => onReview(event.currentTarget)}>
          <span>{copy.cta}</span><ArrowUpRight aria-hidden="true" />
        </button> : null}
      </div>
    </section>
  </>;
}
