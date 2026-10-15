"use client";

import { AlertTriangle } from "lucide-react";
import { AdditionalRequirementSection } from "./AdditionalRequirementSection";
import { RecordCopyFeedback, RecordNotice, RecordPhraseRow, RecordSection } from "./RecordTextParts";
import { useRecordClipboard } from "./useRecordClipboard";
import styles from "./forms.module.css";
import { getRecordClientWords, type ClientGender } from "./recordClientTexts";

function getTexts(clientGender: ClientGender) {
  const t = getRecordClientWords(clientGender);
  const TRAVEL_RECORD_PHRASE =
    `${t.Client} ${t.wasAcquainted} s rozsahem krytí léčebných výloh, asistenčních služeb, pojištění odpovědnosti, úrazu, a dalších sjednaných připojištění, s limity pojistného plnění, územní platností, dobou pojištění, hlavními výlukami, povinnostmi pojištěného při vzniku pojistné události a postupem při jejím hlášení. Současně ${t.wasWarned} na rizika spojená s nesjednáním vyšších limitů nebo dalších připojištění odpovídajících účelu cesty.`;

  return { TRAVEL_RECORD_PHRASE };
}

export function TravelRecordForm({ clientGender = "male" }: { clientGender?: ClientGender }) {
  const { TRAVEL_RECORD_PHRASE } = getTexts(clientGender);
  const { copiedText, copyError, handleCopy } = useRecordClipboard();

  return (
    <div className={styles.stack}>
      <AdditionalRequirementSection clientGender={clientGender} />
      <RecordNotice title="Cestovní pojištění · Tato sekce je v přípravě">
        Zatím je možné využít Doporučenou univerzální větu níže.
      </RecordNotice>
      <RecordSection eyebrow="Dopady a upozornění" title="Doporučená univerzální věta">
        <div className={styles.callout}>
          <AlertTriangle size={16} aria-hidden="true" />
          <p>Výstraha: text vždy uprav dle skutečně sjednávaného krytí,
            limitů, územní platnosti, doby pojištění a zvolených připojištění.</p>
        </div>
        <RecordPhraseRow index={1} text={TRAVEL_RECORD_PHRASE} copiedText={copiedText} onCopy={handleCopy} />
      </RecordSection>
      <RecordCopyFeedback copiedText={copiedText} copyError={copyError} />
    </div>
  );
}
