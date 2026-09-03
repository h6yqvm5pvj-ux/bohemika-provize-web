import type { PaymentFrequency, Product } from "../types/domain";

import { productLabel as productLabelFromCatalog } from "@/app/lib/productCatalog";
import type { PdfOcrProgress } from "@/app/lib/pdfOcr";

import { allowedFrequencies } from "./calculatorHelpers";

export type ParsedContractPdf = Record<string, any>;

type PdfParserOptions = {
  onOcrStart?: () => void;
  onOcrProgress?: (progress: PdfOcrProgress) => void;
};

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
  const value = Number(parsed[key]);
  return Number.isFinite(value) ? value : null;
};

const isIsoDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

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
  const parsedFrequencyRaw = parsedTextValue(parsed, "frequency");
  const parsedFrequency = parsed.frequency as PaymentFrequency | null | undefined;
  const frequencyAllowed =
    parsedFrequency != null && allowedFrequencies(product).includes(parsedFrequency);
  const contractSignedDateInvalid = Boolean(contractSignedDate && !isIsoDay(contractSignedDate));
  const policyStartDateInvalid = Boolean(policyStartDate && !isIsoDay(policyStartDate));
  const signedDateAfterPolicyStart =
    isIsoDay(contractSignedDate) &&
    isIsoDay(policyStartDate) &&
    contractSignedDate > policyStartDate;

  const missing = [
    ["clientName", clientName],
    ["contractNumber", contractNumber],
    ["contractSignedDate", contractSignedDate],
    ["policyStartDate", policyStartDate],
    ["frequency", parsedFrequencyRaw || (parsedFrequency ? String(parsedFrequency) : "")],
    ["amount", amount == null ? "" : String(amount)],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => PDF_IMPORT_REQUIRED_FIELD_MESSAGES[key])
    .filter((value): value is string => Boolean(value));

  const warnings: string[] = [];
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

export async function detectProductFromPdfLazy(file: File) {
  const { detectProductFromPdf } = await import("../lib/detectProductFromPdf");
  return detectProductFromPdf(file);
}

export async function parseMaxCizinKomplexPdfLazy(file: File): Promise<ParsedContractPdf> {
  const { parseMaxCizinKomplexPdf } = await import(
    "../lib/parseMaxCizinKomplexPdf"
  );
  return parseMaxCizinKomplexPdf(file);
}

export async function parseContractPdfByProduct(
  product: Product,
  file: File,
  options: PdfParserOptions = {}
): Promise<ParsedContractPdf | null> {
  switch (product) {
    case "cppAuto": {
      const { parseCppAutoPdf } = await import("../lib/parseCppAutoPdf");
      return parseCppAutoPdf(file);
    }
    case "slaviaauto": {
      const { parseSlaviaAutoPdf } = await import("../lib/parseSlaviaAutoPdf");
      return parseSlaviaAutoPdf(file);
    }
    case "allianzAuto": {
      const { parseAllianzAutoPdf } = await import("../lib/parseAllianzAutoPdf");
      return parseAllianzAutoPdf(file);
    }
    case "csobAuto": {
      const { parseCsobAutoPdf } = await import("../lib/parseCsobAutoPdf");
      return parseCsobAutoPdf(file);
    }
    case "uniqaAuto": {
      const { parseUniqaAutoPdf } = await import("../lib/parseUniqaAutoPdf");
      return parseUniqaAutoPdf(file);
    }
    case "pillowAuto": {
      const { parsePillowAutoPdf } = await import("../lib/parsePillowAutoPdf");
      return parsePillowAutoPdf(file);
    }
    case "kooperativaAuto": {
      const { parseKooperativaAutoPdf } = await import(
        "../lib/parseKooperativaAutoPdf"
      );
      return parseKooperativaAutoPdf(file);
    }
    case "neon": {
      const { parseNeonPdf } = await import("../lib/parseNeonPdf");
      return parseNeonPdf(file);
    }
    case "flexi": {
      const { parseFlexiPdf } = await import("../lib/parseFlexiPdf");
      return parseFlexiPdf(file);
    }
    case "domex":
    case "domexneuron": {
      const { parseDomexPdf } = await import("../lib/parseDomexPdf");
      return parseDomexPdf(file);
    }
    case "cppbytex": {
      const { parseCppBytexPdf } = await import("../lib/parseCppBytexPdf");
      return parseCppBytexPdf(file);
    }
    case "cpphafan": {
      const { parseCppHafanPdf } = await import("../lib/parseCppHafanPdf");
      return parseCppHafanPdf(file);
    }
    case "koopodzam": {
      const { parseKoopOdzamPdf } = await import("../lib/parseKoopOdzamPdf");
      return parseKoopOdzamPdf(file);
    }
    case "maxdomov": {
      const { parseMaxdomovPdf } = await import("../lib/parseMaxdomovPdf");
      return parseMaxdomovPdf(file);
    }
    case "maxcizinkomplex":
      return parseMaxCizinKomplexPdfLazy(file);
    case "comfortcc": {
      const { parseComfortPdf } = await import("../lib/parseComfortPdf");
      return parseComfortPdf(file);
    }
    case "cppcestovko": {
      const { parseCppCestovkoPdf } = await import("../lib/parseCppCestovkoPdf");
      return parseCppCestovkoPdf(file);
    }
    case "axacestovko": {
      const { parseAxaCestovkoPdf } = await import("../lib/parseAxaCestovkoPdf");
      return parseAxaCestovkoPdf(file);
    }
    case "koopcestovko": {
      const { parseKooperativaCestovkoPdf } = await import(
        "../lib/parseKooperativaCestovkoPdf"
      );
      return parseKooperativaCestovkoPdf(file);
    }
    case "cppsimplex": {
      const { parseCppSimplexPdf } = await import("../lib/parseCppSimplexPdf");
      return parseCppSimplexPdf(file);
    }
    case "zamex": {
      const { parseCppZamexPdf } = await import("../lib/parseCppZamexPdf");
      return parseCppZamexPdf(file);
    }
    default:
      return null;
  }
}

/**
 * Every product for which `parseContractPdfByProduct` has a dedicated parser.
 * Keep bulk import derived from this registry so a new parser is never
 * accidentally available only for single-PDF import.
 */
export const AUTOMATED_PDF_PRODUCTS: readonly Product[] = [
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "pillowAuto",
  "kooperativaAuto",
  "cppcestovko",
  "axacestovko",
  "koopcestovko",
  "cppsimplex",
  "neon",
  "flexi",
  "domexneuron",
  "domex",
  "cppbytex",
  "cpphafan",
  "zamex",
  "koopodzam",
  "maxdomov",
  "maxcizinkomplex",
  "comfortcc",
];

const PDF_AUTOMATED_PRODUCT_SET = new Set<Product>(AUTOMATED_PDF_PRODUCTS);

export const hasAutomatedPdfImport = (product: Product): boolean =>
  PDF_AUTOMATED_PRODUCT_SET.has(product);

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
