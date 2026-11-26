import { RecordPhraseRow, RecordSection } from "./RecordTextParts";
import { getRecordClientWords, type ClientGender } from "./recordClientTexts";

export function LiabilityLimitRecommendationSection({
  clientGender,
  copiedText,
  onCopy,
}: {
  clientGender: ClientGender;
  copiedText: string | null;
  onCopy: (text: string) => void;
}) {
  const t = getRecordClientWords(clientGender);

  return (
    <RecordSection
      eyebrow="Limit plnění"
      title={`Jaký limit plnění odpovědnosti ${t.client} požaduje sjednat?`}
      description={`Při nižších limitech než 50.000.000 Kč doporučuji do dopadů uvést, že ${t.clientDative} bylo důrazně doporučeno sjednat limit 50 mil. Kč - Přesto požaduje (požadovaný limit ${t.clientGenitive} v Kč).`}
    >
      <RecordPhraseRow
        text={`${t.ClientDative} bylo důrazně doporučeno sjednat limit 50 mil. Kč - Přesto požaduje `}
        helper={`Za větu doplň požadovaný limit ${t.clientGenitive} v Kč.`}
        copiedText={copiedText}
        onCopy={onCopy}
      />
    </RecordSection>
  );
}
