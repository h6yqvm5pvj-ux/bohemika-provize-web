import { normalizeContractPaymentDetails, type ContractPaymentDetails } from "@/app/lib/contractPaymentDetails";
import { ContractPaymentDetailsError } from "./contractPaymentDetailsErrors";

type Options = {
  contractNumber: string;
  fileName: string;
  downloadPdf: (signal: AbortSignal) => Promise<Blob>;
  signal: AbortSignal;
};

const ensureActive = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException("Načítání bylo zrušeno.", "AbortError");
};

/** Read the payment instructions from this contract's authorized PDF attachment. */
export async function loadContractPaymentDetailsFromPdf({ contractNumber, fileName, downloadPdf, signal }: Options): Promise<ContractPaymentDetails> {
  ensureActive(signal);
  const expectedNumber = typeof contractNumber === "string" ? contractNumber.replace(/\s/g, "") : "";
  if (!/^\d{1,10}$/.test(expectedNumber)) throw new ContractPaymentDetailsError("invalidContractNumber");
  let pdf: Blob;
  try {
    pdf = await downloadPdf(signal);
  } catch {
    ensureActive(signal);
    throw new ContractPaymentDetailsError("pdfDownload");
  }
  ensureActive(signal);
  let parser: typeof import("@/app/lib/parseDomexPdf");
  try {
    parser = await import("@/app/lib/parseDomexPdf");
  } catch {
    ensureActive(signal);
    throw new ContractPaymentDetailsError("pdfReaderLoad");
  }
  ensureActive(signal);
  let parsed: Awaited<ReturnType<typeof parser.parseDomexPdf>>;
  try {
    parsed = await parser.parseDomexPdf(new File([pdf], fileName, { type: "application/pdf" }), { signal, allowOcr: true });
  } catch {
    ensureActive(signal);
    throw new ContractPaymentDetailsError("pdfRead");
  }
  ensureActive(signal);
  if (parsed.contractNumber?.replace(/\s/g, "") !== expectedNumber) throw new ContractPaymentDetailsError("contractMismatch");
  const details = normalizeContractPaymentDetails(parsed.paymentDetails);
  if (!details) throw new ContractPaymentDetailsError("paymentMissing");
  if (details.variableSymbol !== expectedNumber) throw new ContractPaymentDetailsError("contractMismatch");
  return details;
}
