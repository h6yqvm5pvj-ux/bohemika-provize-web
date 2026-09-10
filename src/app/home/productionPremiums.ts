import { isInheritedContract } from "@/app/lib/inheritedContracts";
import type { PaymentFrequency, Product } from "@/app/types/domain";
import { productCategory } from "@/app/lib/productCatalog";
import { entrySignedDate, normalizeToAnnual } from "./homeUtils";

export type ProductionPremiums = {
  lifeMonthly: number;
  otherAnnual: number;
};

type PremiumEntry = Parameters<typeof entrySignedDate>[0] & {
  acquisitionType?: "inherited" | null;
  productKey?: Product;
  inputAmount?: number | null;
  frequencyRaw?: PaymentFrequency | null;
};

/** The same signing-date window as the production counts, with separate units. */
export function summarizeProductionPremiums(
  entries: readonly PremiumEntry[],
  rangeStart: Date,
  rangeEnd: Date,
): ProductionPremiums {
  const totals: ProductionPremiums = { lifeMonthly: 0, otherAnnual: 0 };
  for (const entry of entries) {
    if (isInheritedContract(entry)) continue;
    const signed = entrySignedDate(entry);
    if (!signed || signed < rangeStart || signed >= rangeEnd) continue;
    const amount = entry.inputAmount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) continue;
    const category = productCategory(entry.productKey);
    if (category === "life") {
      // The calculator stores life inputAmount as monthly premium, including
      // legacy records whose frequencyRaw can still contain another frequency.
      totals.lifeMonthly += amount;
    } else if (category === "auto" || category === "property" || category === "travel") {
      totals.otherAnnual += normalizeToAnnual(amount, entry.frequencyRaw);
    }
    // Gold purchases and unknown products do not represent insurance premiums.
  }
  return totals;
}
