import { describe, expect, it } from "vitest";

import { calculateCppPPRbez } from "@/app/lib/productFormulas/cppPPRbez";
import { calculateCppPPRs } from "@/app/lib/productFormulas/cppPPRs";
import type { CommissionResultItemDTO } from "@/app/types/domain";
import { paymentBasedTotals, paymentsPerYear } from "./contractDetailHelpers";

// The detail displays per-payment items; annual summary rows are filtered out.
const perPaymentItems = (items: CommissionResultItemDTO[]) =>
  items.filter((item) => item.title.includes("(z platby)"));

describe("contract detail annual commission totals", () => {
  it.each(["annual", "semiannual", "quarterly"] as const)(
    "includes KOMPLEX acquisition commission with %s payments",
    (frequency) => {
      const multiplier = paymentsPerYear(frequency);
      const result = calculateCppPPRbez(13978 / multiplier, frequency, "poradce5");
      const totals = paymentBasedTotals(perPaymentItems(result.items), multiplier);

      expect(totals.immediate).toBeCloseTo(2471.31, 2);
      expect(totals.immediate).toBeCloseTo(result.total, 8);
      expect(totals.subsequent).toBeCloseTo(823.30, 2);
    }
  );

  it.each([
    ["manazer5", "poradce5", 479.45, 160.75],
    ["manazer8", "manazer5", 880.61, 293.54],
  ] as const)(
    "includes the %s override above %s without rounding installments first",
    (manager, subordinate, firstYear, subsequentYear) => {
      const managerItems = perPaymentItems(calculateCppPPRbez(6989, "semiannual", manager).items);
      const subordinateItems = perPaymentItems(calculateCppPPRbez(6989, "semiannual", subordinate).items);
      const overrideItems = managerItems.map((item, index) => ({
        ...item,
        amount: item.amount - subordinateItems[index].amount,
      }));
      const totals = paymentBasedTotals(overrideItems, 2);

      expect(totals.immediate).toBeCloseTo(firstYear, 2);
      expect(totals.subsequent).toBeCloseTo(subsequentYear, 2);
    }
  );

  it.each(["annual", "semiannual", "quarterly"] as const)(
    "keeps ordinary immediate commission totals for KOMPLEX ÚPIS with %s payments",
    (frequency) => {
      const multiplier = paymentsPerYear(frequency);
      const result = calculateCppPPRs(13978 / multiplier, frequency, "poradce5");
      const totals = paymentBasedTotals(perPaymentItems(result.items), multiplier);

      expect(totals.immediate).toBeCloseTo(823.30, 2);
      expect(totals.immediate).toBeCloseTo(result.total, 8);
      expect(totals.subsequent).toBeCloseTo(823.30, 2);
    }
  );

  it("keeps empty totals at zero", () => {
    expect(paymentBasedTotals([], 2)).toEqual({ immediate: 0, subsequent: 0 });
  });
});
