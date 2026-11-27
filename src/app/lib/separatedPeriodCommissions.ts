import { type CommissionResultItemDTO, type Product } from "@/app/types/domain";

const PER_PAYMENT_SEPARATED_PERIOD_PRODUCTS = new Set<Product>([
  "domexneuron",
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

export function expectedCppPropertyCommissionAmount(items: CommissionResultItemDTO[], terms: { multiplier: number; acquisition: boolean }): number | null {
  const titlePart = terms.acquisition ? "okamzita provize" : "nasledna provize";
  const candidates = items.filter(item => typeof item?.title === "string" && Number.isFinite(item.amount)).map(item => ({
    amount: item.amount,
    title: item.title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(),
  })).filter(item => item.title.includes(titlePart) && !item.title.includes("za rok"));
  const perPayment = candidates.find(item => item.title.includes("z platby")) ?? candidates[0];
  return perPayment ? Math.round(perPayment.amount * terms.multiplier * 100) / 100 : null;
}
