"use client";

import { AlertTriangle, CheckCircle2, FileText, Home, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { AdditionalRequirementSection } from "./AdditionalRequirementSection";
import { RecordCopyButton, RecordCopyFeedback, RecordNotice, RecordPhraseRow, RecordSection } from "./RecordTextParts";
import { useRecordClipboard } from "./useRecordClipboard";
import styles from "./forms.module.css";
import { getRecordClientWords, type ClientGender } from "./recordClientTexts";

function getTexts(clientGender: ClientGender) {
  const t = getRecordClientWords(clientGender);
  const LIABILITY_REQUIREMENT_VARIANTS = [
    `${t.Client} požaduje i pojištění čisté finanční újmy, ${t.client} si přeje územní platnost EU u odpovědnosti, dále si přeje roční platbu.`,
    `${t.Client} si přeje spol. 5.000,-Kč, územní platnost: ČR + sousedící státy; čistá finanční újma 1.000 000,-Kč, roční platba, produkt SIMPLEX od ČPP ve variantě MAXI.`,
    `${t.Client} vyžaduje vysvětlit výluky pojištění dle pojistných podmínek k požadovanému typu pojištění.`,
    `${t.Client} nemá jiné požadavky.`,
  ];

  const PROPERTY_REQUIREMENT_VARIANTS = [
    "Produkt SIMPLEX od ČPP včetně připojištění asistenční služby, varianta OPTI, územní platnost: ČR + sousedící státy, spoluúčast 3.000,-; u rizika povodeň a záplava spoluúčast 1%, minimálně 10.000,-; platba roční.",
    `${t.Client} nemá jiné požadavky.`,
  ];

  const PRODUCT_RECOMMENDATIONS = [
    {
      product: "SIMPLEX",
      focus: "Pojištění majetku",
      text: "Balíčkové pojištění, široký rozsah pojistné ochrany, možnost volby spoluúčastí.",
    },
    {
      product: "SIMPLEX",
      focus: "Pojištění odpovědnosti",
      text: "Balíčkové pojištění, široký rozsah pojistné ochrany, možnost volby spoluúčastí.",
    },
    {
      product: "KPX III",
      focus: "Jednotlivá volba rizik",
      text: "Možnost volby spoluúčasti.",
    },
    {
      product: "KOOP TREND",
      focus: "Jednotlivá volba rizik",
      text: "Možnost volby spoluúčasti.",
    },
  ];

  const GENERAL_RECOMMENDATION_VARIANTS = [
    "All risk pojištění s vysokým krytím podnikatelské odpovědnosti i majetku, varianta OPTI (ČR + sousedící státy).",
    "All risk pojištění s vysokým krytím podnikatelské odpovědnosti i majetku, varianta MAXI (pro území ČR a celé EVROPY).",
    `${t.Client} si u pojištění majetku/odpovědnosti ${t.chose} variantu MAXI, kde ${t.recipient} vyhovují všechny limity stanovené pojistnými podmínkami produktu SIMPLEX.`,
  ];

  const IMPACT_PARAGRAPHS = [
    `${t.Client} si přeje pojištění majetku i odpovědnosti pro své podnikání v kadeřnictví. ${t.ClientDative} byly nabídnuté a vysvětlené všechny varianty a balíčky pojištění, ${t.clientDative} byly vysvětleny základní pojmy pojištění, rozsah pojistného krytí, limity pojistného plnění, vysvětlené spoluúčasti a ${t.wasAcquainted} s pojistnými podmínkami a výlukami.`,
    `${t.Client} volí pojištění majetku ve variantě OPTI na limit plnění 2.000.000,-Kč se spol. 5.000,-Kč, další částky v balíčku s ${t.clientInstrumental} projednané a souhlasí.`,
    "Pojištění odpovědnosti volí ve variantě OPTI, vysvětlená územní platnost ČR + okolní státy EU, požaduje limit plnění 2.000.000,-Kč se spol. 5.000,-Kč.",
    `${t.Client} ${t.wasWarned}, že by pojistné částky nemusely být dostačující, byly doporučené vyšší, ty ${t.client} odmítá a bere na vědomí a souhlasí s částkami, které si ${t.selected}. Toto může být negativním dopadem - nevyužití vyšších pojistných částek, ${t.warned} na možná rizika spojená s tímto nedostatečným krytím.`,
    `${t.Client} ${t.wasAcquainted}, kdyby v budoucnu ${t.requested} vyšší pojistné částky, lze pojistnou smlouvu přepracovat a navýšit. Dále ${t.client} ${t.acquainted} kdyby se v průběhu roku zvedl výrazně obrat společnosti, je ${t.obliged} tuto skutečnost nahlásit do pojištění.`,
    `${t.Client} návrhu ${t.understood}, ${t.had} možnost klást dotazy a ${t.decided} se pro sjednání pojištění dle své volby. S prolongací ${t.client} souhlasí a smlouva se sjednává platbou.`,
    `Pojistná smlouva bude sjednána s akceptací platbou (vznikne připsáním pojistného na účet pojišťovny). Vzhledem k tomu, že je ${t.clientInstrumental} požadovaná platnost od druhého dne, je třeba uhradit pojistné obratem. Pojistnou smlouvu i veškerou další dokumentaci obdrží ${t.client} e-mailem.`,
  ];

  return { LIABILITY_REQUIREMENT_VARIANTS, PROPERTY_REQUIREMENT_VARIANTS, PRODUCT_RECOMMENDATIONS, GENERAL_RECOMMENDATION_VARIANTS, IMPACT_PARAGRAPHS };
}

function TopicCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className={styles.topic}>
      <div className={styles.topicHeader}>{icon}<h3>{title}</h3></div>
      {children}
    </article>
  );
}

function VariantList({ items, copiedText, onCopy }: { items: string[]; copiedText: string | null; onCopy: (text: string) => void }) {
  return (
    <div className={styles.variantList}>
      {items.map((item, index) => (
        <RecordPhraseRow key={item} index={index + 1} text={item} copiedText={copiedText} onCopy={onCopy} />
      ))}
    </div>
  );
}

export function BusinessRecordForm({ clientGender = "male" }: { clientGender?: ClientGender }) {
  const t = getRecordClientWords(clientGender);
  const { LIABILITY_REQUIREMENT_VARIANTS, PROPERTY_REQUIREMENT_VARIANTS, PRODUCT_RECOMMENDATIONS, GENERAL_RECOMMENDATION_VARIANTS, IMPACT_PARAGRAPHS } = getTexts(clientGender);
  const { copiedText, copyError, handleCopy } = useRecordClipboard();
  const copyProps = { copiedText, onCopy: handleCopy };

  return (
    <div className={styles.stack}>
      <AdditionalRequirementSection clientGender={clientGender} />
      <RecordNotice title="Podnikatelé · Tato sekce je v přípravě">
        ZZJ Podnikatelé - SIMPLEX, KOMPLEX III, KOOP TREND.
      </RecordNotice>
      <RecordSection
        eyebrow={`Požadavky ${t.clientGenitive}`}
        title="Specifické varianty požadavků podle oblasti"
        description="Například výluky, čekací doby, klesající nebo neklesající pojistná částka, realokace investiční části a další specifika."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <TopicCard icon={<ShieldCheck size={17} aria-hidden="true" />} title="Odpovědnost">
            <VariantList items={LIABILITY_REQUIREMENT_VARIANTS} {...copyProps} />
          </TopicCard>
          <TopicCard icon={<Home size={17} aria-hidden="true" />} title="Majetek">
            <VariantList items={PROPERTY_REQUIREMENT_VARIANTS} {...copyProps} />
          </TopicCard>
        </div>
      </RecordSection>
      <RecordSection eyebrow="Doporučení produktu" title="Doporučení pojistného produktu - fyzická osoba podnikající">
        <div className="grid gap-3 md:grid-cols-2">
          {PRODUCT_RECOMMENDATIONS.map(item => (
            <article key={`${item.product}-${item.focus}`} className={styles.product}>
              <div className={styles.productHeader}><span>{item.product}</span><h3>{item.focus}</h3></div>
              <p>{item.text}</p>
              <RecordCopyButton text={item.text} {...copyProps} />
            </article>
          ))}
        </div>
        <TopicCard icon={<CheckCircle2 size={17} aria-hidden="true" />} title="Všeobecné varianty">
          <VariantList items={GENERAL_RECOMMENDATION_VARIANTS} {...copyProps} />
        </TopicCard>
      </RecordSection>
      <RecordSection
        eyebrow="Nesrovnalosti"
        title={`Výčet případných nesrovnalostí mezi požadavky ${t.customerGenitive} a nabízeným pojištěním`}
        description="Když je zaškrtnuto ANO, uveď důvod."
      >
        <div className={styles.callout}>
          <AlertTriangle size={16} aria-hidden="true" />
          <p>{`Např.: ${t.Client} se ${t.asked} i na připojištění finančních sankcí, sděleno, že toto připojištění je součástí výluk a nelze připojistit. ${t.Client} je s tímto ${t.acquainted} a souhlasí s pojištěním bez této výluky.`}</p>
        </div>
      </RecordSection>
      <RecordSection
        eyebrow="Dopady"
        title="Popis dopadů sjednání pojištění/změny pojištění"
        description={`Vysvětlení dopadů sjednání nebo podstatné změny pojištění na ${t.customerAccusative}, včetně souvisejících rizik.`}
      >
        {IMPACT_PARAGRAPHS.map((paragraph, index) => (
          <RecordPhraseRow key={paragraph} index={index + 1} text={paragraph} {...copyProps} />
        ))}
        <div className={styles.notice}>
          <FileText size={16} aria-hidden="true" />
          <p>Text uprav podle konkrétního oboru podnikání, zvolené varianty,
            limitů, spoluúčastí, územní platnosti a způsobu vzniku pojistné smlouvy.</p>
        </div>
      </RecordSection>
      <RecordCopyFeedback copiedText={copiedText} copyError={copyError} />
    </div>
  );
}
