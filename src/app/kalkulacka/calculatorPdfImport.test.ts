import { describe, expect, it } from "vitest";

import type { Product } from "../types/domain";
import {
  AUTOMATED_PDF_PRODUCTS,
  BULK_PDF_PRODUCTS,
  hasAutomatedPdfImport,
} from "./calculatorPdfImport";

const PRODUCTS_WITH_CONTRACT_PDF_PARSER: Product[] = [
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
