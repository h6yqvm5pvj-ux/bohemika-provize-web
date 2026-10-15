"use client";

import { useEffect, useRef, useState } from "react";

export type RecordCopyFeedback = { kind: "success" | "error"; message: string } | null;

export function useRecordClipboard() {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(() => () => {
    request.current += 1;
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async (text: string) => {
    const currentRequest = ++request.current;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setCopiedText(null);
    setCopyError(false);

    try {
      await navigator.clipboard.writeText(text);
      if (currentRequest !== request.current) return;
      setCopiedText(text);
      resetTimer.current = setTimeout(() => setCopiedText(null), 2400);
    } catch {
      if (currentRequest !== request.current) return;
      setCopyError(true);
    }
  };

  const feedback: RecordCopyFeedback = copyError
    ? { kind: "error", message: "Text se nepodařilo zkopírovat. Zkus to znovu nebo ho označ a zkopíruj ručně." }
    : copiedText ? { kind: "success", message: "Text je ve schránce. Můžeš ho vložit do záznamu." } : null;

  return { copiedText, copyError, feedback, handleCopy };
}
