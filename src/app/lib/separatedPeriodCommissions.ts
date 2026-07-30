import { type Product } from "@/app/types/domain";

const PER_PAYMENT_SEPARATED_PERIOD_PRODUCTS = new Set<Product>([
  "domex",
  "cppbytex",
  "cpphafan",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "cppPPRbez",
  "cppsimplex",
  "cppPPRs",
  "zamex",
]);

const ANNUAL_SEPARATED_PERIOD_PRODUCTS = new Set<Product>([
  "pillowmajetek",
  "allianzmujdomov",
]);

export function isPerPaymentSeparatedPeriodProduct(
  product?: Product | null
): product is Product {
  if (!product) return false;
  return PER_PAYMENT_SEPARATED_PERIOD_PRODUCTS.has(product);
}

export function isAnnualSeparatedPeriodProduct(
  product?: Product | null
): product is Product {
  if (!product) return false;
  return ANNUAL_SEPARATED_PERIOD_PRODUCTS.has(product);
}

export function isSeparatedPeriodCommissionProduct(
  product?: Product | null
): product is Product {
  return (
    isPerPaymentSeparatedPeriodProduct(product) ||
    isAnnualSeparatedPeriodProduct(product)
  );
}
