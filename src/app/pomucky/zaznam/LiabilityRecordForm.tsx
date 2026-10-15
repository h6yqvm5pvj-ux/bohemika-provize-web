"use client";

import { AdditionalRequirementSection } from "./AdditionalRequirementSection";
import { RecordCopyFeedback, RecordNotice, RecordPhraseRow, RecordSection } from "./RecordTextParts";
import { useRecordClipboard } from "./useRecordClipboard";
import styles from "./forms.module.css";
import { getRecordClientWords, type ClientGender } from "./recordClientTexts";

function getTexts(clientGender: ClientGender) {
  const t = getRecordClientWords(clientGender);
  const UNIVERSAL_LIABILITY_PHRASES = [
    `${t.Client} ${t.wasAcquainted} s rozsahem pojistného krytí, hlavními výlukami z pojištění, limity pojistného plnění a sjednanou spoluúčastí.`,
    `${t.Client} ${t.wasAcquainted} s pojistnými podmínkami, jejich obsahem a ${t.had} možnost klást doplňující dotazy, které ${t.recipient} byly zodpovězeny.`,
    `${t.Client} ${t.wasWarned} na výluky z pojištění a skutečnost, že pojistitel poskytuje pojistné plnění pouze v rozsahu sjednaném pojistnou smlouvou a pojistnými podmínkami.`,
    `${t.Client} ${t.wasAcquainted} s možnostmi nastavení rozsahu pojištění, výší pojistných limitů a jejich vlivem na rozsah pojistné ochrany a výši pojistného.`,
  ];

  const LIMIT_RECOMMENDATION_TEXT =
    `${t.ClientDative} bylo důrazně doporučeno sjednat limit 50 mil. Kč - Přesto požaduje `;

  return { UNIVERSAL_LIABILITY_PHRASES, LIMIT_RECOMMENDATION_TEXT };
}

export function LiabilityRecordForm({ clientGender = "male" }: { clientGender?: ClientGender }) {
  const t = getRecordClientWords(clientGender);
  const { UNIVERSAL_LIABILITY_PHRASES, LIMIT_RECOMMENDATION_TEXT } = getTexts(clientGender);
  const { copiedText, copyError, handleCopy } = useRecordClipboard();

  return (
    <div className={styles.stack}>
      <AdditionalRequirementSection clientGender={clientGender} />
      <RecordNotice title="Odpovědnost · Tato sekce je v přípravě">
        Zatím je možné využít Doporučené univerzální věty níže.
      </RecordNotice>
      <RecordSection
        eyebrow="Dopady a upozornění"
        title="Doporučené univerzální věty"
        description="Vyber text podle projednaného tématu a uprav ho pro konkrétní sjednávané pojištění."
      >
        {UNIVERSAL_LIABILITY_PHRASES.map((phrase, index) => (
          <RecordPhraseRow key={phrase} index={index + 1} text={phrase} copiedText={copiedText} onCopy={handleCopy} />
        ))}
      </RecordSection>
      <RecordSection
        eyebrow="Limit plnění"
        title={`Jaký limit plnění odpovědnosti ${t.client} požaduje sjednat?`}
        description={`Při nižších limitech než 50.000.000 Kč doporučuji do dopadů uvést, že ${t.clientDative} bylo důrazně doporučeno sjednat limit 50 mil. Kč - Přesto požaduje (požadovaný limit ${t.clientGenitive} v Kč).`}
      >
        <RecordPhraseRow text={LIMIT_RECOMMENDATION_TEXT} helper={`Za větu doplň požadovaný limit ${t.clientGenitive} v Kč.`} copiedText={copiedText} onCopy={handleCopy} />
      </RecordSection>
      <RecordCopyFeedback copiedText={copiedText} copyError={copyError} />
    </div>
  );
}
