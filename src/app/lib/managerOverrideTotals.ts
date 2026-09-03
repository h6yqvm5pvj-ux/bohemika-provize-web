import {
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Product,
} from "@/app/types/domain";

const LEGACY_FREQUENCY_OVERRIDE_PRODUCTS = new Set<Product>([
  "domexneuron",
  "domex",
  "cppbytex",
  "cppAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "kooperativaAuto",
  "koopflotila",
  "slaviaauto",
  "slaviaflotila",
  "cpphafan",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "zamex",
  "cppsimplex",
  "cppPPRs",
  "cppPPRbez",
]);

const roundToCents = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const normalizeTitle = (title: string | undefined | null): string =>
  (title ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

const paymentsPerYear = (frequency: PaymentFrequency | null | undefined): number => {
  switch (frequency) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    default:
      return 1;
  }
};

const sumByTitle = (
  items: CommissionResultItemDTO[],
  predicate: (normalizedTitle: string) => boolean
): number =>
  roundToCents(
    items.reduce((sum, item) => {
      if (item.excludeFromTotal) return sum;
      const title = normalizeTitle(item.title);
      if (!predicate(title)) return sum;
      return sum + (item.amount ?? 0);
    }, 0)
  );

export const isLegacyFrequencyOverrideProduct = (
  productKey: Product | null | undefined
): productKey is Product =>
  Boolean(productKey && LEGACY_FREQUENCY_OVERRIDE_PRODUCTS.has(productKey));

export const computeLegacyFrequencyOverrideTotal = ({
  productKey,
  frequencyRaw,
  items,
  fallbackTotal,
}: {
  productKey: Product | null | undefined;
  frequencyRaw: PaymentFrequency | null | undefined;
  items: CommissionResultItemDTO[] | null | undefined;
  fallbackTotal: number;
}): number => {
  if (!isLegacyFrequencyOverrideProduct(productKey)) {
    return roundToCents(fallbackTotal);
  }

  const normalizedItems = Array.isArray(items) ? items : [];
  if (normalizedItems.length === 0) return 0;

  const annualSum = sumByTitle(normalizedItems, (title) => title.includes("za rok"));
  if (annualSum > 0) return annualSum;

  const immediateSum = sumByTitle(normalizedItems, (title) =>
    title.includes("okamžitá provize")
  );
  if (immediateSum <= 0) return roundToCents(fallbackTotal);

  return roundToCents(immediateSum * paymentsPerYear(frequencyRaw));
};

export const expectedLegacyAnnualItemTitle = (
  productKey: Product | null | undefined
): string =>
  productKey === "kooperativaAuto" || productKey === "koopflotila"
    ? "Celkem za rok"
    : "📅 Provize za rok";
