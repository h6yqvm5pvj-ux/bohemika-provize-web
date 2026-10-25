import type { Product } from "../types/domain";

/** Products with a dedicated contract-PDF parser; shared by import and diagnostics. */
export const AUTOMATED_PDF_PRODUCTS: readonly Product[] = [
  "conseqzenit", "cppAuto", "slaviaauto", "allianzAuto", "csobAuto", "uniqaAuto",
  "pillowAuto", "kooperativaAuto", "cppcestovko", "axacestovko", "koopcestovko",
  "cppsimplex", "cppPPRbez", "cppPPRs", "neon", "flexi", "domexneuron", "domex",
  "cppbytex", "cpphafan", "zamex", "koopodzam", "maxdomov", "maxcizinkomplex", "comfortcc",
];

const automatedProducts = new Set<Product>(AUTOMATED_PDF_PRODUCTS);
export const hasAutomatedPdfImport = (product: Product): boolean => automatedProducts.has(product);
