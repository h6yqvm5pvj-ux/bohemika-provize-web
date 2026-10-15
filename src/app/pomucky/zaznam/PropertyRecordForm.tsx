"use client";

import { AdditionalRequirementSection } from "./AdditionalRequirementSection";
import { RecordCopyFeedback, RecordNotice, RecordPhraseRow, RecordSection } from "./RecordTextParts";
import { useRecordClipboard } from "./useRecordClipboard";
import styles from "./forms.module.css";
import { getRecordClientWords, type ClientGender } from "./recordClientTexts";

function getTexts(clientGender: ClientGender) {
  const t = getRecordClientWords(clientGender);
  const DOMEX_BONUS_PHRASE =
    `${t.Client} ${t.wasAcquainted} s podmínkami vstupního bonusu 30 % za bezeškodní průběh a ${t.wasWarned}, že v případě pojistné události může dojít ke snížení bonusu a následnému navýšení pojistného při výročí smlouvy v souladu s podmínkami pojišťovny.`;
  const FLOOD_DECLINED_PHRASE =
    `${t.ClientDative} bylo nabídnuto připojištění rizika povodně a záplavy, přesto je nepožaduje. ${t.Client} ${t.wasAcquainted} s riziky spojenými s nesjednáním tohoto připojištění.`;

  const UNIVERSAL_PROPERTY_PHRASES = [
    `${t.Client} ${t.wasAcquainted} s rozsahem sjednaného pojistného krytí, hlavními výlukami z pojištění, limity a sublimity pojistného plnění, výší spoluúčasti a územní platností pojištění.`,
    `${t.Client} ${t.wasInformed} o způsobu stanovení pojistných částek a limitů, rozdílu mezi novou a obvyklou cenou (je-li relevantní) a o možných důsledcích podpojištění nebo nesprávně stanovených pojistných částek.`,
    "Byly vysvětleny povinnosti pojistníka a pojištěného při sjednání pojištění, během jeho trvání i při vzniku pojistné události, včetně povinnosti předcházet vzniku škod a oznamovat změny rozhodné pro pojištění.",
    `${t.Client} ${t.wasAcquainted} s možnostmi rozšíření pojistné ochrany, výší pojistných limitů a dopady případného nesjednání doporučeného rozsahu pojištění. Rozsah sjednaného pojištění odpovídá zjištěným potřebám a požadavkům ${t.clientGenitive}.`,
    `${t.Client} ${t.wasInformed} o možnosti změny hodnoty pojištěného majetku v průběhu trvání pojištění a bylo ${t.recipient} doporučeno pravidelně přehodnocovat pojistné částky, limity a rozsah pojistného krytí, aby pojištění i nadále odpovídalo ${t.possessiveDative} aktuálním potřebám a byla minimalizována rizika podpojištění nebo nedostatečného pojistného krytí.`,
  ];

  return { DOMEX_BONUS_PHRASE, FLOOD_DECLINED_PHRASE, UNIVERSAL_PROPERTY_PHRASES };
}

export function PropertyRecordForm({ clientGender = "male" }: { clientGender?: ClientGender }) {
  const { DOMEX_BONUS_PHRASE, FLOOD_DECLINED_PHRASE, UNIVERSAL_PROPERTY_PHRASES } = getTexts(clientGender);
  const t = getRecordClientWords(clientGender);
  const { copiedText, copyError, handleCopy } = useRecordClipboard();

  return (
    <div className={styles.stack}>
      <AdditionalRequirementSection clientGender={clientGender} />
      <RecordNotice title="Majetek · Tato sekce je v přípravě">
        Zatím je možné využít větu pro ČPP DOMEX, upozornění k povodni a záplavě a univerzální věty níže.
      </RecordNotice>
      <RecordSection
        eyebrow="Dopady a upozornění"
        title="ČPP DOMEX – vstupní bonus 30 %"
        description="Text do části „Popis dopadů“ záznamu z jednání pouze při sjednání pojištění stavby nebo domácnosti v produktu ČPP DOMEX. Nevztahuje se na sjednání samotného pojištění odpovědnosti v produktu DOMEX."
      >
        <RecordPhraseRow text={DOMEX_BONUS_PHRASE} copiedText={copiedText} onCopy={handleCopy} />
      </RecordSection>
      <RecordSection
        eyebrow="Dopady a upozornění"
        title="Nesjednání připojištění povodně a záplavy"
        description={`Pokud ${t.client} nechce připojistit riziko povodně a záplavy, zapiš odmítnutí do části „Popis dopadů“ záznamu z jednání.`}
      >
        <RecordPhraseRow text={FLOOD_DECLINED_PHRASE} copiedText={copiedText} onCopy={handleCopy} />
      </RecordSection>
      <RecordSection
        eyebrow="Dopady a upozornění"
        title="Doporučené univerzální věty"
        description="Vyber text podle projednaného tématu a uprav ho pro konkrétní sjednávané pojištění."
      >
        {UNIVERSAL_PROPERTY_PHRASES.map((phrase, index) => (
          <RecordPhraseRow key={phrase} index={index + 1} text={phrase} copiedText={copiedText} onCopy={handleCopy} />
        ))}
      </RecordSection>
      <RecordCopyFeedback copiedText={copiedText} copyError={copyError} />
    </div>
  );
}
