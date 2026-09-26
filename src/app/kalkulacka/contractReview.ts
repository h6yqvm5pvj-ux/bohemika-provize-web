import type { PaymentFrequency, Product } from "../types/domain";
import { formatMoney } from "../lib/formatters";
import { productCategory, productLabel } from "../lib/productCatalog";
import { createClientNameIndex, type ClientNameMatch } from "./clientNameMatching";
import { productContractNumberPatterns } from "./contractNumberPatterns";

export type ContractReview = {
  title: string;
  rows: { label: string; value: string }[];
  warnings: string[];
};

const paymentsPerYear: Record<PaymentFrequency, number> = {
  monthly: 12, quarterly: 4, semiannual: 2, annual: 1,
};

// Internal review thresholds, not insurer limits. Corporate and fleet policies
// have a separate threshold; investment fees are not treated as premiums.
const corporateProducts = new Set<Product>([
  "slaviaflotila", "uniqaflotila", "koopflotila", "cppPPRs", "cppPPRbez",
  "cppsimplex", "kooppmop", "cppbytex",
]);

function premiumReviewLimit(product: Product): { amount: number; period: "month" | "year" | "contract" } | null {
  if (corporateProducts.has(product)) return { amount: 1_000_000, period: "year" };
  switch (productCategory(product)) {
    case "life":
    case "pension": return { amount: 10_000, period: "month" };
    case "auto":
    case "property": return { amount: 100_000, period: "year" };
    case "travel": return { amount: product === "maxcizinkomplex" ? 100_000 : 30_000, period: "contract" };
    default: return null;
  }
}

export function buildContractReviewWarnings({
  product, clientName, contractNumber, amount, frequency,
  originalContractNumber, clientNameMatches = [],
}: {
  product: Product;
  clientName: string;
  contractNumber: string;
  amount: number;
  frequency: PaymentFrequency;
  originalContractNumber?: string | null;
  clientNameMatches?: ClientNameMatch[];
}): string[] {
  const warnings: string[] = [];
  const numberPattern = productContractNumberPatterns[product];
  for (const [label, raw, original] of [
    ["Číslo smlouvy", contractNumber, false],
    ["Číslo původní smlouvy", originalContractNumber, true],
  ] as const) {
    const number = raw?.replace(/\s+/g, "");
    if (!number) continue;
    const prefixes = (original ? numberPattern?.originalPrefixes : undefined) ?? numberPattern?.prefixes ?? [];
    const unusualProductFormat = numberPattern && (
      number.length !== numberPattern.digits || !prefixes.some((prefix) => number.startsWith(prefix))
    );
    if (!/^\d{6,14}$/.test(number) || /^(\d)\1+$/.test(number) || unusualProductFormat) {
      const expectedFormat = numberPattern
        ? ` Pro ${productLabel(product)} je obvyklé číslo s ${numberPattern.digits} číslicemi a začátkem ${prefixes.join(", ")}.`
        : "";
      warnings.push(`${label} „${raw?.trim()}“ má neobvyklý formát.${expectedFormat} Zkontroluj ho podle smlouvy, včetně počtu číslic.`);
    }
  }

  const name = createClientNameIndex([clientName])[0];
  if (clientName.trim() && !name) {
    warnings.push("Jméno klienta neobsahuje čitelné jméno ani název firmy.");
  } else if (name && !name.company) {
    if (name.tokens.length < 2) {
      warnings.push("Jméno klienta vypadá neúplně. Zkontroluj, zda nechybí jméno nebo příjmení; u firmy ověř její název.");
    } else if (/\d|[@<>_=]/u.test(clientName)) {
      warnings.push("Jméno klienta obsahuje číslice nebo neobvyklé znaky. Zkontroluj, zda se do něj nedostal jiný údaj.");
    }
  }
  if (!clientNameMatches.some((match) => ["exact", "normalized", "reordered"].includes(match.kind))) {
    const similar = clientNameMatches.filter((match) => match.kind === "similar").slice(0, 2);
    if (similar.length) warnings.push(`Možný překlep ve jméně: v adresáři je ${similar.map((match) => `„${match.name}“`).join(" nebo ")}. Ověř, zda jde o stejného klienta.`);
  }

  const limit = premiumReviewLimit(product);
  if (limit && Number.isFinite(amount) && amount > 0) {
    const checkedAmount = limit.period === "year" ? amount * paymentsPerYear[frequency] : amount;
    if (checkedAmount > limit.amount) {
      const period = limit.period === "month" ? "měsíčně" : limit.period === "year" ? "ročně" : "za smlouvu";
      const label = product === "conseqzenit" ? "Příspěvek" : "Pojistné";
      warnings.push(`${label} ${formatMoney(checkedAmount, { maxFractionDigits: 2 })} ${period} přesahuje orientační hranici pro kontrolu ${formatMoney(limit.amount)}. Ověř částku a frekvenci platby; může jít o nulu navíc nebo záměnu měsíční a roční částky.`);
    }
  }
  return warnings;
}
