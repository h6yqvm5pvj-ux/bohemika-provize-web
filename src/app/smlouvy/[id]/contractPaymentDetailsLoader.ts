import { normalizeContractPaymentDetails, type ContractPaymentDetails } from "@/app/lib/contractPaymentDetails";
import { ContractPaymentDetailsError } from "./contractPaymentDetailsErrors";

import type { PaymentFrequency } from "@/app/types/domain";

type Options = {
  product: "domexneuron" | "koopmajetekobcan" | "koopodzam" | "neon" | "cppAuto" | "allianzAuto" | "flexi" | "pillowAuto";
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
  type PaymentPdfResult = { contractNumber?: string | null; paymentDetails?: unknown; insuredItems?: unknown; frequency?: unknown };
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
    } else if (product === "allianzAuto") {
      const parser = await import("@/app/lib/parseAllianzAutoPdf");
      parsePdf = parser.parseAllianzAutoPdf;
    } else if (product === "flexi") {
      const parser = await import("@/app/lib/parseFlexiPdf");
      parsePdf = parser.parseFlexiPdf;
    } else if (product === "pillowAuto") {
      const parser = await import("@/app/lib/parsePillowAutoPdf");
      parsePdf = parser.parsePillowAutoPdf;
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
  const validFrequencies: PaymentFrequency[] = ["monthly", "quarterly", "semiannual", "annual"];
  const frequency = validFrequencies.includes(parsed.frequency as PaymentFrequency) ? parsed.frequency as PaymentFrequency : undefined;
  if (product !== "pillowAuto" && details.variableSymbol !== expectedNumber) {
    throw new ContractPaymentDetailsError("contractMismatch");
  }
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
    ...(frequency ? { frequency } : {}),
    ...(insuredItems.length ? { insuredItems } : {}),
    ...(product === "cppAuto" || product === "allianzAuto" || product === "pillowAuto" ? { paymentNote: "Částka k úhradě je platná pouze pro 1. rok pojištění. Pojistné se po 1. výročí může lišit dle navýšení / ponížení pojistného pojišťovnou!" } : {}),
  };
}
