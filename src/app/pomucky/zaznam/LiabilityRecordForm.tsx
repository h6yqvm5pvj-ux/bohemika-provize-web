"use client";

import { AdditionalRequirementSection } from "./AdditionalRequirementSection";
import { LiabilityLimitRecommendationSection } from "./LiabilityLimitRecommendationSection";
import { RecordCopyFeedback, RecordNotice, RecordPhraseRow, RecordSection } from "./RecordTextParts";
import { useRecordClipboard } from "./useRecordClipboard";
import styles from "./forms.module.css";
import { getRecordClientWords, type ClientGender } from "./recordClientTexts";
import type { RecordLiabilityKind } from "./types";

function getTexts(clientGender: ClientGender) {
  const t = getRecordClientWords(clientGender);
  const wasWarned = t.wasWarned[0].toUpperCase() + t.wasWarned.slice(1);
  const UNIVERSAL_LIABILITY_PHRASES = [
    `${t.Client} ${t.wasAcquainted} s rozsahem pojistného krytí, hlavními výlukami z pojištění, limity pojistného plnění a sjednanou spoluúčastí.`,
    `${t.Client} ${t.wasAcquainted} s pojistnými podmínkami, jejich obsahem a ${t.had} možnost klást doplňující dotazy, které ${t.recipient} byly zodpovězeny.`,
    `${t.Client} ${t.wasWarned} na výluky z pojištění a skutečnost, že pojistitel poskytuje pojistné plnění pouze v rozsahu sjednaném pojistnou smlouvou a pojistnými podmínkami.`,
    `${t.Client} ${t.wasAcquainted} s možnostmi nastavení rozsahu pojištění, výší pojistných limitů a jejich vlivem na rozsah pojistné ochrany a výši pojistného.`,
  ];

  const EMPLOYEE_LIABILITY_PHRASES = [
    `${t.Client} ${t.wasAcquainted} s rozsahem pojištění odpovědnosti zaměstnance vůči zaměstnavateli a s potřebou přizpůsobit sjednané krytí vykonávanému povolání a pracovním činnostem.`,
    `${t.Client} ${t.wasAcquainted} s pojistnými podmínkami, jejich obsahem a ${t.had} možnost klást doplňující dotazy, které ${t.recipient} byly zodpovězeny.`,
    `${t.Client} ${t.wasAcquainted} se sjednaným limitem pojistného plnění, případnými sublimity a výší spoluúčasti. ${wasWarned} na finanční dopady spoluúčasti při pojistné události.`,
    `${t.Client} ${t.wasWarned} na hlavní výluky a omezení pojištění a skutečnost, že pojistitel poskytuje pojistné plnění pouze v rozsahu sjednaném pojistnou smlouvou a pojistnými podmínkami.`,
    `${t.Client} ${t.wasAcquainted} s doporučením sjednat pojistný limit ve výši 4,5násobku průměrného hrubého měsíčního výdělku. ${wasWarned}, že při sjednání nižšího limitu může být případná škoda kryta pouze částečně a zbývající část bude muset uhradit z vlastních prostředků.`,
  ];

  return { UNIVERSAL_LIABILITY_PHRASES, EMPLOYEE_LIABILITY_PHRASES };
}

export function LiabilityRecordForm({ clientGender = "male", kind = "citizen" }: { clientGender?: ClientGender; kind?: RecordLiabilityKind }) {
  const { UNIVERSAL_LIABILITY_PHRASES, EMPLOYEE_LIABILITY_PHRASES } = getTexts(clientGender);
  const { copiedText, copyError, handleCopy } = useRecordClipboard();

  if (kind === "employee") {
    return (
      <div className={styles.stack}>
        <AdditionalRequirementSection clientGender={clientGender} />
        <RecordSection
          eyebrow="Dopady a upozornění"
          title="Odpovědnost zaměstnance – doporučené věty"
          description="Vyber text podle projednaného tématu a uprav ho pro konkrétní sjednávané pojištění."
        >
          {EMPLOYEE_LIABILITY_PHRASES.map((phrase, index) => (
            <RecordPhraseRow key={phrase} index={index + 1} text={phrase} copiedText={copiedText} onCopy={handleCopy} />
          ))}
        </RecordSection>
        <RecordCopyFeedback copiedText={copiedText} copyError={copyError} />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <AdditionalRequirementSection clientGender={clientGender} />
      <RecordNotice title="Odpovědnost občana · Tato sekce je v přípravě">
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
      <LiabilityLimitRecommendationSection clientGender={clientGender} copiedText={copiedText} onCopy={handleCopy} />
      <RecordCopyFeedback copiedText={copiedText} copyError={copyError} />
    </div>
  );
}
