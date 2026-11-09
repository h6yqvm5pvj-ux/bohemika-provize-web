import { normalizeContractPaymentDetails, type ContractPaymentDetails } from "@/app/lib/contractPaymentDetails";
import { ContractPaymentDetailsError } from "./contractPaymentDetailsErrors";

type Options = {
  product: "domexneuron" | "koopmajetekobcan" | "koopodzam" | "neon" | "cppAuto";
  contractNumber: string;
  fileName: string;
  downloadPdf: (signal: AbortSignal) => Promise<Blob>;
  signal: AbortSignal;
};

export type ContractPdfDetails = ContractPaymentDetails & { insuredItems?: string[]; paymentNote?: string };

const ensureActive = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException("Načítání bylo zrušeno.", "AbortError");
};

/** Read the payment instructions from this contract's authorized PDF attachment. */
export async function loadContractPaymentDetailsFromPdf({ product, contractNumber, fileName, downloadPdf, signal }: Options): Promise<ContractPdfDetails> {
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
  type PaymentPdfResult = { contractNumber?: string | null; paymentDetails?: unknown; insuredItems?: unknown };
  type PaymentPdfParser = (file: File, options: { signal: AbortSignal; allowOcr: true }) => Promise<PaymentPdfResult>;
  let parsePdf: PaymentPdfParser;
  try {
    if (product === "domexneuron") {
      const parser = await import("@/app/lib/parseDomexPdf");
      parsePdf = parser.parseDomexPdf;
    } else if (product === "koopmajetekobcan") {
      const parser = await import("@/app/lib/parseKoopMajetekObcanPdf");
      parsePdf = parser.parseKoopMajetekObcanPdf;
    } else if (product === "neon") {
      const parser = await import("@/app/lib/parseNeonPdf");
      parsePdf = parser.parseNeonPdf;
    } else if (product === "cppAuto") {
      const parser = await import("@/app/lib/parseCppAutoPdf");
      parsePdf = parser.parseCppAutoPdf;
    } else {
      const parser = await import("@/app/lib/parseKoopOdzamPdf");
      parsePdf = parser.parseKoopOdzamPdf;
    }
  } catch {
    ensureActive(signal);
    throw new ContractPaymentDetailsError("pdfReaderLoad");
  }
  ensureActive(signal);
  let parsed: PaymentPdfResult;
  try {
    parsed = await parsePdf(new File([pdf], fileName, { type: "application/pdf" }), { signal, allowOcr: true });
  } catch {
    ensureActive(signal);
    throw new ContractPaymentDetailsError("pdfRead");
  }
  ensureActive(signal);
  if (parsed.contractNumber?.replace(/\s/g, "") !== expectedNumber) throw new ContractPaymentDetailsError("contractMismatch");
  const details = normalizeContractPaymentDetails(parsed.paymentDetails);
  if (!details) throw new ContractPaymentDetailsError("paymentMissing");
  if (details.variableSymbol !== expectedNumber) throw new ContractPaymentDetailsError("contractMismatch");
  const insuredItems = Array.isArray(parsed.insuredItems)
    ? parsed.insuredItems.slice(0, 12).flatMap(value => {
      if (typeof value !== "string") return [];
      const label = value.trim();
      return label.length >= 3 && label.length <= 100 && /\p{L}/u.test(label) && !/[\u0000-\u001f\u007f]/.test(label)
        ? [label]
        : [];
    })
    : [];
  return {
    ...details,
    ...(insuredItems.length ? { insuredItems } : {}),
    ...(product === "cppAuto" ? { paymentNote: "Částka k úhradě je platná pouze pro 1. rok pojištění. Pojistné se po 1. výročí může lišit dle navýšení / ponížení pojistného pojišťovnou!" } : {}),
  };
}
