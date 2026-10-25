import { describe, expect, it } from "vitest";

import type { Product } from "../types/domain";
import {
  AUTOMATED_PDF_PRODUCTS,
  BULK_PDF_PRODUCTS,
  hasAutomatedPdfImport,
  buildPdfImportIssueMessage,
  buildPdfParserReport,
  missingPdfImportFields,
  resolveDetectedPdfProduct,
} from "./calculatorPdfImport";

const PRODUCTS_WITH_CONTRACT_PDF_PARSER: Product[] = [
  "conseqzenit",
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
  "cppPPRbez",
  "cppPPRs",
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

describe("AUTOMATED_PDF_PRODUCTS", () => {
  it("keeps a manually selected KOMPLEX ÚPIS arrangement during detection", () => {
    expect(resolveDetectedPdfProduct("cppPPRbez", "cppPPRs")).toBe("cppPPRs");
    expect(resolveDetectedPdfProduct("cppPPRbez", null)).toBe("cppPPRbez");
    expect(resolveDetectedPdfProduct("cppPPRbez", "cppsimplex")).toBe("cppPPRbez");
    expect(resolveDetectedPdfProduct("cppAuto", "cppPPRs")).toBe("cppAuto");
  });
  it("surfaces inconsistent premium values for review before save", () => {
    expect(buildPdfImportIssueMessage({ product: "cppPPRbez", parsed: { pdfImportWarnings: ["Pojistné: součet splátek se liší."] } })).toContain("součet splátek se liší");
  });
  it("contains every product with a contract-PDF parser", () => {
    expect([...AUTOMATED_PDF_PRODUCTS].sort()).toEqual(
      [...PRODUCTS_WITH_CONTRACT_PDF_PARSER].sort()
    );
    expect(new Set(AUTOMATED_PDF_PRODUCTS)).toHaveLength(AUTOMATED_PDF_PRODUCTS.length);
  });

  it("matches the availability check used by single and bulk import", () => {
    for (const product of PRODUCTS_WITH_CONTRACT_PDF_PARSER) {
      expect(hasAutomatedPdfImport(product)).toBe(true);
    }
    expect(hasAutomatedPdfImport("pillowmajetek")).toBe(false);
    expect(hasAutomatedPdfImport("maximaMaxEfekt")).toBe(false);
  });

  it("keeps Comfort CC available for single import but excludes it from batch import", () => {
    expect(hasAutomatedPdfImport("comfortcc")).toBe(true);
    expect(BULK_PDF_PRODUCTS).not.toContain("comfortcc");
    expect(BULK_PDF_PRODUCTS).toHaveLength(AUTOMATED_PDF_PRODUCTS.length - 1);
  });
});

describe("PDF import missing amounts", () => {
  const parsed = {
    clientName: "Jan Novák", contractNumber: "9512345678", contractSignedDate: "2024-11-04",
    policyStartDate: "2025-01-01", policyEndDate: "2040-04-12", frequency: "monthly",
  };

  it.each([null, undefined, "", " "])("reports an unread amount as missing: %s", (amount) => {
    const message = buildPdfImportIssueMessage({ product: "conseqzenit", parsed: { ...parsed, amount } });
    expect(message).toContain("Nenašel jsem výši příspěvku klienta");
    expect(message).not.toContain("není kladná");
  });

  it("still warns about a contribution actually read as zero", () => {
    const message = buildPdfImportIssueMessage({ product: "conseqzenit", parsed: { ...parsed, amount: 0 } });
    expect(message).toContain("Částka: není kladná");
  });
});


describe("native parser failure reporting", () => {
  const complete = {
    clientName: "Jana Testovací", contractNumber: "1400000001", contractSignedDate: "2026-09-01",
    policyStartDate: "2026-10-01", frequency: "monthly", amount: 704,
    pdfNativeTextReadable: true, pdfNeedsOcr: false,
  };
  it("reports precisely missing required fields without including their values", () => {
    const report = buildPdfParserReport({ product: "flexi", parsed: { ...complete, amount: null, clientName: "" }, ocrAttempted: false });
    expect(report?.missingFields).toEqual(["amount", "clientName"]);
    expect(JSON.stringify(report)).not.toContain("1400000001");
    expect(JSON.stringify(report)).not.toContain("2026-09-01");
  });
  it.each([
    { ocrAttempted: true }, { ocrTextUsed: true }, { pdfNeedsOcr: true },
    { pdfNativeTextReadable: false }, { pdfNativeTextReadable: undefined }, { isEndorsement: true },
  ])("never reports OCR, scans, unreadable text or intentionally partial amendments: %j", overrides => {
    expect(buildPdfParserReport({ product: "flexi", parsed: { ...complete, amount: null, ...overrides }, ocrAttempted: overrides.ocrAttempted ?? false })).toBeNull();
  });
  it("ignores warnings without missing fields and unsupported manual products", () => {
    expect(buildPdfParserReport({ product: "flexi", parsed: { ...complete, amount: 0, pdfImportWarnings: ["Unusual value"] }, ocrAttempted: false })).toBeNull();
    expect(buildPdfParserReport({ product: "pillowmajetek", parsed: { ...complete, amount: null }, ocrAttempted: false })).toBeNull();
  });
  it("shares the required-field definition with the existing import warning", () => {
    expect(missingPdfImportFields({ product: "conseqzenit", parsed: complete })).toEqual(["policyEndDate"]);
    expect(buildPdfImportIssueMessage({ product: "conseqzenit", parsed: complete })).toContain("datum konce");
    expect(missingPdfImportFields({ product: "flexi", parsed: complete })).toEqual([]);
  });
});
