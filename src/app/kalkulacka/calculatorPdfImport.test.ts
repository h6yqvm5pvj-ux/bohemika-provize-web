import { describe, expect, it } from "vitest";

import type { Product } from "../types/domain";
import {
  AUTOMATED_PDF_PRODUCTS,
  BULK_PDF_PRODUCTS,
  hasAutomatedPdfImport,
  buildPdfImportIssueMessage,
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
