import type { PaymentFrequency, Product } from "../types/domain";

import { productLabel as productLabelFromCatalog } from "@/app/lib/productCatalog";
import { readPdfText, type PdfReadOptions } from "@/app/lib/pdfDocumentText";

import { allowedFrequencies } from "./calculatorHelpers";
import { AUTOMATED_PDF_PRODUCTS, hasAutomatedPdfImport } from "@/app/lib/contractPdfProducts";
import { PDF_PARSER_REPORT_VERSION, type PdfParserMissingField, type PdfParserReport } from "@/app/lib/pdfParserReport";
export { AUTOMATED_PDF_PRODUCTS, hasAutomatedPdfImport } from "@/app/lib/contractPdfProducts";

export type ParsedContractPdf = Record<string, any>;

type PdfParserOptions = PdfReadOptions;

// The KOMPLEX document identifies the product, not the adviser's underwriting
// commission arrangement. Keep an explicitly selected ÚPIS variant.
export function resolveDetectedPdfProduct(detected: Product, selected: Product | null): Product {
  return detected === "cppPPRbez" && selected === "cppPPRs" ? selected : detected;
}

const PDF_IMPORT_REQUIRED_FIELD_MESSAGES: Record<string, string> = {
  clientName: "pojistníka",
  contractNumber: "číslo smlouvy",
  contractSignedDate: "datum sjednání",
  policyStartDate: "počátek pojištění",
  frequency: "frekvenci plateb",
  amount: "částku pojistného",
};

const parsedTextValue = (parsed: ParsedContractPdf, key: string): string => {
  if (!(key in parsed)) return "";
  const value = parsed[key];
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
};

const parsedNumberValue = (parsed: ParsedContractPdf, key: string): number | null => {
  if (!(key in parsed)) return null;
  if (parsed[key] == null || (typeof parsed[key] === "string" && !parsed[key].trim())) return null;
  const value = Number(parsed[key]);
  return Number.isFinite(value) ? value : null;
};

const isIsoDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function missingPdfImportFields({ product, parsed }: {
  product: Product; parsed: ParsedContractPdf;
}): PdfParserMissingField[] {
  const missing: PdfParserMissingField[] = [];
  for (const key of ["clientName", "contractNumber", "contractSignedDate", "policyStartDate", "frequency"] as const) {
    if (!parsedTextValue(parsed, key)) missing.push(key);
  }
  if (parsedNumberValue(parsed, "amount") == null) missing.push("amount");
  if (product === "conseqzenit" && !parsed.policyEndDate) missing.push("policyEndDate");
  return missing;
}

export function buildPdfParserReport({ product, parsed, ocrAttempted }: {
  product: Product; parsed: ParsedContractPdf; ocrAttempted: boolean;
}): PdfParserReport | null {
  // Incomplete amendments and scans are not evidence of a contract-parser defect.
  if (!hasAutomatedPdfImport(product) || ocrAttempted || parsed.ocrTextUsed === true ||
    parsed.pdfNeedsOcr === true || parsed.pdfNativeTextReadable !== true || parsed.isEndorsement === true) return null;
  const missingFields = missingPdfImportFields({ product, parsed }).sort();
  return missingFields.length ? { product, missingFields, extraction: "native", parserVersion: PDF_PARSER_REPORT_VERSION } : null;
}

export function buildPdfImportIssueMessage({
  product,
  parsed,
}: {
  product: Product;
  parsed: ParsedContractPdf;
}): string | null {
  const contractNumber = parsedTextValue(parsed, "contractNumber");
  const clientName = parsedTextValue(parsed, "clientName");
  const policyStartDate = parsedTextValue(parsed, "policyStartDate");
  const contractSignedDate = parsedTextValue(parsed, "contractSignedDate");
  const amount = parsedNumberValue(parsed, "amount");
  const parsedFrequency = parsed.frequency as PaymentFrequency | null | undefined;
  const frequencyAllowed =
    parsedFrequency != null && allowedFrequencies(product).includes(parsedFrequency);
  const contractSignedDateInvalid = Boolean(contractSignedDate && !isIsoDay(contractSignedDate));
  const policyStartDateInvalid = Boolean(policyStartDate && !isIsoDay(policyStartDate));
  const signedDateAfterPolicyStart =
    isIsoDay(contractSignedDate) &&
    isIsoDay(policyStartDate) &&
    contractSignedDate > policyStartDate;

  const requiredFieldMessages: Record<string, string> = product === "conseqzenit"
    ? { ...PDF_IMPORT_REQUIRED_FIELD_MESSAGES, clientName: "jméno klienta", policyStartDate: "počátek smlouvy", amount: "výši příspěvku klienta" }
    : PDF_IMPORT_REQUIRED_FIELD_MESSAGES;

  const missing = missingPdfImportFields({ product, parsed }).map(key => key === "policyEndDate"
    ? "datum konce (datum narození klienta a cílový věk strategie spoření)"
    : requiredFieldMessages[key]);

  const warnings: string[] = Array.isArray(parsed.pdfImportWarnings)
    ? parsed.pdfImportWarnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  if (clientName && clientName.split(/\s+/).filter(Boolean).length < 2) {
    warnings.push("Klient: jméno vypadá neúplně");
  }
  if (contractNumber && !/^\d{6,14}$/.test(contractNumber.replace(/\s+/g, ""))) {
    warnings.push("Smlouva: číslo má nezvyklý formát");
  }
  if (contractSignedDateInvalid) {
    warnings.push("Datum sjednání: datum má nezvyklý formát");
  } else if (signedDateAfterPolicyStart) {
    warnings.push("Datum sjednání: sjednání je po počátku pojištění");
  }
  if (policyStartDateInvalid) {
    warnings.push("Počátek: datum má nezvyklý formát");
  }
  if (parsedFrequency && !frequencyAllowed) {
    warnings.push("Frekvence: není pro vybraný produkt povolená");
  }
  if (amount != null && amount <= 0) {
    warnings.push("Částka: není kladná");
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Nenašel jsem ${missing.join(", ")}.`);
  }
  if (warnings.length > 0) {
    parts.push(`Podezřelé hodnoty: ${warnings.join("; ")}.`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" ")} Doplň nebo zkontroluj ručně před uložením.`;
}

export function unreadablePdfImportMessage({
  product,
  productDetected,
}: {
  product: Product;
  productDetected: boolean;
}): string {
  const productPart = productDetected
    ? `PDF jsem rozpoznal jako ${productLabelFromCatalog(product, product)}, ale`
    : `Produkt z PDF jsem nerozpoznal a`;
  return `${productPart} nenašel jsem čitelné hodnoty smlouvy. Zkontroluj vybraný produkt, případně údaje doplň ručně.`;
}

export async function detectProductFromPdfLazy(file: File, options: PdfParserOptions = {}) {
  const { detectProductFromPdf } = await import("../lib/detectProductFromPdf");
  return detectProductFromPdf(file, options);
}

export async function parseMaxCizinKomplexPdfLazy(file: File, options: PdfParserOptions = {}): Promise<ParsedContractPdf> {
  const { parseMaxCizinKomplexPdf } = await import(
    "../lib/parseMaxCizinKomplexPdf"
  );
  return parseMaxCizinKomplexPdf(file, options);
}

async function parseProduct(
  product: Product,
  file: File,
  options: PdfParserOptions = {}
): Promise<ParsedContractPdf | null> {
  switch (product) {
    case "cppPPRbez":
    case "cppPPRs": {
      const { parseCppKomplexPdf } = await import("../lib/parseCppKomplexPdf");
      return parseCppKomplexPdf(file, options);
    }
    case "conseqzenit": {
      const { parseConseqZenitPdf } = await import("../lib/parseConseqZenitPdf");
      return parseConseqZenitPdf(file, options);
    }
    case "cppAuto": {
      const { parseCppAutoPdf } = await import("../lib/parseCppAutoPdf");
      return parseCppAutoPdf(file, options);
    }
    case "slaviaauto": {
      const { parseSlaviaAutoPdf } = await import("../lib/parseSlaviaAutoPdf");
      return parseSlaviaAutoPdf(file, options);
    }
    case "allianzAuto": {
      const { parseAllianzAutoPdf } = await import("../lib/parseAllianzAutoPdf");
      return parseAllianzAutoPdf(file, options);
    }
    case "csobAuto": {
      const { parseCsobAutoPdf } = await import("../lib/parseCsobAutoPdf");
      return parseCsobAutoPdf(file, options);
    }
    case "uniqaAuto": {
      const { parseUniqaAutoPdf } = await import("../lib/parseUniqaAutoPdf");
      return parseUniqaAutoPdf(file, options);
    }
    case "pillowAuto": {
      const { parsePillowAutoPdf } = await import("../lib/parsePillowAutoPdf");
      return parsePillowAutoPdf(file, options);
    }
    case "kooperativaAuto": {
      const { parseKooperativaAutoPdf } = await import(
        "../lib/parseKooperativaAutoPdf"
      );
      return parseKooperativaAutoPdf(file, options);
    }
    case "neon": {
      const { parseNeonPdf } = await import("../lib/parseNeonPdf");
      return parseNeonPdf(file, options);
    }
    case "flexi": {
      const { parseFlexiPdf } = await import("../lib/parseFlexiPdf");
      return parseFlexiPdf(file, options);
    }
    case "domex":
    case "domexneuron": {
      const { parseDomexPdf } = await import("../lib/parseDomexPdf");
      return parseDomexPdf(file, options);
    }
    case "cppbytex": {
      const { parseCppBytexPdf } = await import("../lib/parseCppBytexPdf");
      return parseCppBytexPdf(file, options);
    }
    case "cpphafan": {
      const { parseCppHafanPdf } = await import("../lib/parseCppHafanPdf");
      return parseCppHafanPdf(file, options);
    }
    case "koopodzam": {
      const { parseKoopOdzamPdf } = await import("../lib/parseKoopOdzamPdf");
      return parseKoopOdzamPdf(file, options);
    }
    case "maxdomov": {
      const { parseMaxdomovPdf } = await import("../lib/parseMaxdomovPdf");
      return parseMaxdomovPdf(file, options);
    }
    case "maxcizinkomplex":
      return parseMaxCizinKomplexPdfLazy(file, options);
    case "comfortcc": {
      const { parseComfortPdf } = await import("../lib/parseComfortPdf");
      return parseComfortPdf(file, options);
    }
    case "cppcestovko": {
      const { parseCppCestovkoPdf } = await import("../lib/parseCppCestovkoPdf");
      return parseCppCestovkoPdf(file, options);
    }
    case "axacestovko": {
      const { parseAxaCestovkoPdf } = await import("../lib/parseAxaCestovkoPdf");
      return parseAxaCestovkoPdf(file, options);
    }
    case "koopcestovko": {
      const { parseKooperativaCestovkoPdf } = await import(
        "../lib/parseKooperativaCestovkoPdf"
      );
      return parseKooperativaCestovkoPdf(file, options);
    }
    case "cppsimplex": {
      const { parseCppSimplexPdf } = await import("../lib/parseCppSimplexPdf");
      return parseCppSimplexPdf(file, options);
    }
    case "zamex": {
      const { parseCppZamexPdf } = await import("../lib/parseCppZamexPdf");
      return parseCppZamexPdf(file, options);
    }
    default:
      return null;
  }
}

export async function parseContractPdfByProduct(
  product: Product,
  file: File,
  options: PdfParserOptions = {},
): Promise<ParsedContractPdf | null> {
  if (!hasAutomatedPdfImport(product)) return null;
  const readOptions = { ...options, allowOcr: options.allowOcr ?? true };
  const parsed = await parseProduct(product, file, readOptions);
  if (!parsed) return null;
  const document = await readPdfText(file, readOptions);
  const warnings = [...new Set([...(parsed.pdfImportWarnings ?? []), ...document.warnings])];
  return {
    ...parsed,
    pdfNativeTextReadable: document.pages.some(page =>
      page.items.map(item => item.str).join("").replace(/[^\p{L}\p{N}]/gu, "").length >= 80),
    pdfNeedsOcr: document.pages.some(page => page.needsOcr === true),
    ...(document.ocrTextUsed ? { ocrTextUsed: true } : {}),
    ...(warnings.length ? { pdfImportWarnings: warnings } : {}),
  };
}

/**
 * Comfort CC is intentionally excluded from batch import: its contract PDF
 * does not reliably describe the commercial setup needed for unattended save.
 * It remains available for regular, single-PDF import.
 */
export const BULK_PDF_PRODUCTS: readonly Product[] = AUTOMATED_PDF_PRODUCTS.filter(
  (product) => product !== "comfortcc"
);

export const manualPdfImportMessage = (product: Product): string =>
  `Pro produkt ${productLabelFromCatalog(product, product)} zatím není automatické načítání dat z PDF hotové. PDF se při uložení přiloží ke smlouvě, údaje prosím vyplň ručně.`;

export const failedPdfImportMessage = (
  product: Product,
  productDetected = true
): string =>
  productDetected
    ? `PDF se pro produkt ${productLabelFromCatalog(product, product)} nepodařilo automaticky přečíst. Zkontroluj, jestli je PDF čitelné, nebo údaje doplň ručně.`
    : `Produkt z PDF jsem nerozpoznal a import podle vybraného produktu ${productLabelFromCatalog(product, product)} selhal. Zkontroluj vybraný produkt, nebo údaje doplň ručně.`;
