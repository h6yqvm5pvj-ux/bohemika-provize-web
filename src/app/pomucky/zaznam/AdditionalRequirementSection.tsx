"use client";

import { CopyFeedback, ResultSection, ResultTextRow, useRecordClipboard } from "./ResultComponents";
import { getRecordAdditionalRequirement, getRecordClientWords, type ClientGender } from "./recordClientTexts";

export const BASE_ADDITIONAL_REQUIREMENT_TEXT = getRecordAdditionalRequirement();

export function AdditionalRequirementSection({ clientGender = "male" }: { clientGender?: ClientGender }) {
  const { copiedText, feedback, handleCopy } = useRecordClipboard();
  const text = getRecordAdditionalRequirement(clientGender);
  const texts = getRecordClientWords(clientGender);

  return (
    <>
      <ResultSection
        eyebrow="Část 1"
        title={`Další požadavky, potřeby a cíle ${texts.customerGenitive}`}
        description="Text pro úvodní část záznamu z jednání."
        countLabel="1 text"
        copiedText={copiedText}
        onCopy={handleCopy}
      >
        <ResultTextRow index={1} text={text} copiedText={copiedText} onCopy={handleCopy} />
      </ResultSection>
      <CopyFeedback feedback={feedback} />
    </>
  );
}
