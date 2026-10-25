import type { Product } from "../types/domain";
import { hasAutomatedPdfImport } from "./contractPdfProducts";
import { productLabel } from "./productCatalog";

// Bump when parser behavior changes to allow a fresh diagnostic for the same PDF.
export const PDF_PARSER_REPORT_VERSION = "2026-10-25.1";
export const PDF_PARSER_REPORT_MAX_BYTES = 20 * 1024 * 1024;
export const PDF_PARSER_REPORT_FILE_NAME = "podklad-parseru.pdf";
export const PDF_PARSER_FIELD_LABELS = {
  clientName: "Pojistník / klient",
  contractNumber: "Číslo smlouvy",
  contractSignedDate: "Datum sjednání",
  policyStartDate: "Počátek smlouvy",
  frequency: "Frekvence plateb",
  amount: "Pojistné / příspěvek",
  policyEndDate: "Konec smlouvy",
} as const;

export type PdfParserMissingField = keyof typeof PDF_PARSER_FIELD_LABELS;
export type PdfParserReport = {
  product: Product;
  parserVersion: typeof PDF_PARSER_REPORT_VERSION;
  extraction: "native";
  missingFields: PdfParserMissingField[];
};

/** Strict allowlist: never persist extracted values, arbitrary error text or OCR diagnostics. */
export function parsePdfParserReport(value: unknown): PdfParserReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.extraction !== "native" || row.parserVersion !== PDF_PARSER_REPORT_VERSION ||
    typeof row.product !== "string" || !hasAutomatedPdfImport(row.product as Product) ||
    !Array.isArray(row.missingFields) || !row.missingFields.length ||
    row.missingFields.length > Object.keys(PDF_PARSER_FIELD_LABELS).length ||
    row.missingFields.some(field => typeof field !== "string" ||
      !Object.hasOwn(PDF_PARSER_FIELD_LABELS, field) || (field === "policyEndDate" && row.product !== "conseqzenit"))) return null;
  return {
    product: row.product as Product,
    parserVersion: PDF_PARSER_REPORT_VERSION,
    extraction: "native",
    missingFields: [...new Set(row.missingFields as PdfParserMissingField[])].sort(),
  };
}

export function pdfParserReportMessage(report: PdfParserReport): { subject: string; text: string } {
  const label = productLabel(report.product, report.product);
  return {
    subject: `Chyba parseru PDF · ${label}`,
    text: [
      "Automatické hlášení neúplného načtení PDF z kalkulačky.",
      `• Produkt: ${label}`,
      `• Verze parseru: ${report.parserVersion}`,
      "• Zpracování: textový parser bez OCR",
      "• Nenalezené povinné údaje:",
      ...report.missingFields.map(field => `  – ${PDF_PARSER_FIELD_LABELS[field]}`),
      "• Původní PDF je v příloze pro kontrolu parseru.",
    ].join("\n"),
  };
}
