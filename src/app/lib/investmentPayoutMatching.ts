export const INVESTMENT_PAYOUT_PROGRESS_TYPE = "application/x-ndjson";

export type InvestmentPayoutMatchResult = {
  ok: true;
  matchedStatements: number;
  processedStatements: number;
  processingResult: { payoutRecordsAdded: number; payoutRecordsUpdated: number };
};

export type InvestmentPayoutMatchProgress = {
  type: "progress";
  phase: "scanning" | "saving";
  scanned: number;
  total: number;
  monthMs: number | null;
};

export type InvestmentPayoutMatchEvent = InvestmentPayoutMatchProgress
  | { type: "result"; result: InvestmentPayoutMatchResult }
  | { type: "error"; message: string };

export async function readInvestmentPayoutMatch(
  response: Response,
  onProgress: (progress: InvestmentPayoutMatchProgress) => void
): Promise<InvestmentPayoutMatchResult> {
  const reader = response.body?.getReader();
  const incomplete = "Párování výpisů se nepodařilo dokončit.";
  if (!reader || !response.headers.get("content-type")?.startsWith(INVESTMENT_PAYOUT_PROGRESS_TYPE)) {
    await reader?.cancel();
    throw new Error(incomplete);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        let event: InvestmentPayoutMatchEvent;
        try {
          event = JSON.parse(line) as InvestmentPayoutMatchEvent;
        } catch {
          throw new Error(incomplete);
        }
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "result") return event.result;
        onProgress(event);
      }
    }
    throw new Error(incomplete);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
