import type { PaymentFrequency, Product } from "../types/domain";
import type { SlaviaAutoCoverageDetail } from "@/app/lib/parseSlaviaAutoPdf";
import { isIsoDay, productLabel } from "./calculatorHelpers";
import { BULK_PDF_PRODUCTS, type ParsedContractPdf } from "./calculatorPdfImport";

export type AutoBulkImportRowStatus =
  | "queued"
  | "processing"
  | "success"
  | "review"
  | "warning"
  | "skipped"
  | "error";

type AutoBulkReviewDraft = {
  file: File;
  product: Product;
  parsed: ParsedContractPdf;
  warnings: string[];
  isReplacement: boolean;
  replacementNumber: string;
};

export type AutoBulkImportRow = {
  id: string;
  fileName: string;
  status: AutoBulkImportRowStatus;
  productLabel: string | null;
  contractNumber: string | null;
  clientName: string | null;
  message: string;
  reviewDraft?: AutoBulkReviewDraft | null;
};

const BULK_IMPORT_PRODUCTS = BULK_PDF_PRODUCTS;
const BULK_IMPORT_PRODUCT_SET = new Set<Product>(BULK_IMPORT_PRODUCTS);
const PAYMENT_FREQUENCIES: PaymentFrequency[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];

export const parsedPdfTextValue = (parsed: ParsedContractPdf, key: string): string => {
  const value = parsed[key];
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
};

export const parsedPdfNumberValue = (
  parsed: ParsedContractPdf,
  key: string
): number | null => {
  const value = parsed[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const parsedPdfRoundedNumberValue = (
  parsed: ParsedContractPdf,
  key: string
): number | null => {
  const value = parsedPdfNumberValue(parsed, key);
  return value == null ? null : Math.round(value);
};

export const parsedPdfBooleanValue = (parsed: ParsedContractPdf, key: string): boolean =>
  parsed[key] === true;

export const parsedSlaviaAutoDetailValue = (
  parsed: ParsedContractPdf
): SlaviaAutoCoverageDetail | null => {
  const value = parsed.carSlaviaDetail;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SlaviaAutoCoverageDetail)
    : null;
};

export const parsedPdfFrequencyValue = (
  parsed: ParsedContractPdf
): PaymentFrequency | null => {
  const value = parsed.frequency;
  return typeof value === "string" &&
    PAYMENT_FREQUENCIES.includes(value as PaymentFrequency)
    ? (value as PaymentFrequency)
    : null;
};

export const isBulkImportProduct = (
  product: Product | null | undefined
): product is Product => Boolean(product && BULK_IMPORT_PRODUCT_SET.has(product));

export const isBulkImportProductAllowedForSelection = (
  importProduct: Product,
  selectedProduct: Product | null | undefined
): boolean =>
  isBulkImportProduct(importProduct) && isBulkImportProduct(selectedProduct);

export const parsedPdfBooleanOrNumberValue = (
  parsed: ParsedContractPdf,
  booleanKey: string,
  numberKey: string
): boolean =>
  parsedPdfBooleanValue(parsed, booleanKey) ||
  parsedPdfNumberValue(parsed, numberKey) != null;

export const hasParsedDomexDetail = (parsed: ParsedContractPdf): boolean =>
  Boolean(
    parsedPdfTextValue(parsed, "domexAddress") ||
      parsedPdfTextValue(parsed, "domexPropertyType") ||
      parsedPdfTextValue(parsed, "domexPropertyCoverage") ||
      parsedPdfNumberValue(parsed, "domexPropertySumInsured") != null ||
      parsedPdfNumberValue(parsed, "domexPropertyDeductible") != null ||
      parsedPdfTextValue(parsed, "domexHouseholdType") ||
      parsedPdfTextValue(parsed, "domexHouseholdCoverage") ||
      parsedPdfNumberValue(parsed, "domexHouseholdSumInsured") != null ||
      parsedPdfNumberValue(parsed, "domexHouseholdDeductible") != null ||
      parsedPdfNumberValue(parsed, "domexOutbuildingSumInsured") != null ||
      parsedPdfNumberValue(parsed, "domexLiabilitySumInsured") != null ||
      parsedPdfNumberValue(parsed, "domexLiabilityDeductible") != null ||
      parsedPdfBooleanValue(parsed, "domexLiabilityMobile") ||
      parsedPdfBooleanValue(parsed, "domexLiabilityTenant") ||
      parsedPdfBooleanValue(parsed, "domexLiabilityLandlord") ||
      parsedPdfBooleanValue(parsed, "domexAssistancePlus")
  );

export const buildAutoBulkImportWarnings = ({
  product,
  parsed,
  productDetected,
  detectionConfidence,
}: {
  product: Product;
  parsed: ParsedContractPdf;
  productDetected: boolean;
  detectionConfidence: "high" | "medium" | null;
}): string[] => {
  const warnings: string[] = Array.isArray(parsed.pdfImportWarnings)
    ? parsed.pdfImportWarnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  if (!productDetected) {
    warnings.push(
      `produkt se nepodařilo rozpoznat, použil se vybraný produkt ${productLabel(product)}`
    );
  } else if (detectionConfidence === "medium") {
    warnings.push(`produkt byl rozpoznán jen se střední jistotou jako ${productLabel(product)}`);
  }
  if (parsed.ocrTextUsed === true) {
    warnings.push("PDF bylo načtené přes OCR");
  }

  const clientName = parsedPdfTextValue(parsed, "clientName");
  if (clientName && clientName.split(/\s+/).filter(Boolean).length < 2) {
    warnings.push("jméno klienta vypadá neúplně");
  }

  const contractNumber = parsedPdfTextValue(parsed, "contractNumber");
  if (contractNumber && !/^\d{6,14}$/.test(contractNumber.replace(/\s+/g, ""))) {
    warnings.push("číslo smlouvy má nezvyklý formát");
  }

  const signedDate = parsedPdfTextValue(parsed, "contractSignedDate");
  if (signedDate && !isIsoDay(signedDate)) {
    warnings.push("datum sjednání má nezvyklý formát");
  }

  const policyStartDate = parsedPdfTextValue(parsed, "policyStartDate");
  if (policyStartDate && !isIsoDay(policyStartDate)) {
    warnings.push("datum počátku má nezvyklý formát");
  }

  return warnings;
};

export const formatAutoBulkImportWarnings = (warnings: string[]): string => {
  const uniqueWarnings = Array.from(
    new Set(warnings.map((warning) => warning.trim()).filter(Boolean))
  );
  return uniqueWarnings.length > 0
    ? `Zkontroluj: ${uniqueWarnings.join("; ")}.`
    : "";
};
