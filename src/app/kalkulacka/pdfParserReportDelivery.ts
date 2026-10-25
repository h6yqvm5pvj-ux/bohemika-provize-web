import type { User } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { PDF_PARSER_REPORT_FILE_NAME, PDF_PARSER_REPORT_MAX_BYTES, type PdfParserReport } from "@/app/lib/pdfParserReport";

type DeliveryResult = "sent" | "failed" | "skipped";
const pending = new WeakMap<File, Map<string, Promise<DeliveryResult>>>();
let queue: Promise<unknown> = Promise.resolve();

/** Serialize background uploads so a batch does not upload every PDF simultaneously. */
export function deliverPdfParserReport(user: User, file: File, report: PdfParserReport, signal: AbortSignal): Promise<DeliveryResult> {
  if (signal.aborted) return Promise.resolve("skipped");
  if (file.size <= 0 || file.size > PDF_PARSER_REPORT_MAX_BYTES) return Promise.resolve("failed");
  const key = JSON.stringify([user.uid, report]);
  let reports = pending.get(file);
  if (!reports) { reports = new Map(); pending.set(file, reports); }
  const existing = reports.get(key);
  if (existing) return existing;
  const result = queue.then(async (): Promise<DeliveryResult> => {
    if (signal.aborted) return "skipped";
    try {
      const form = new FormData();
      form.set("parserReportJson", JSON.stringify(report));
      form.append("files", file, PDF_PARSER_REPORT_FILE_NAME);
      await fetchAuthedJsonOrThrow(user, "/api/mailbox/compose", { method: "POST", body: form, signal });
      return "sent";
    } catch {
      // Sending diagnostics must never interrupt manual completion or log PDF contents.
      return signal.aborted ? "skipped" : "failed";
    }
  });
  queue = result;
  reports.set(key, result);
  void result.then(status => { if (status !== "sent") reports.delete(key); });
  return result;
}
