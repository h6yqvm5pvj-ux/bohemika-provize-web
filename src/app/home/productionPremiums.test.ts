import { describe, expect, it } from "vitest";
import type { PaymentFrequency, Product } from "@/app/types/domain";
import { summarizeProductionPremiums } from "./productionPremiums";

const start = new Date(2026, 8, 1);
const end = new Date(2026, 9, 1);
const signed = new Date(2026, 8, 10);
const entry = (productKey: Product, inputAmount: number, frequencyRaw?: PaymentFrequency) => ({
  productKey, inputAmount, frequencyRaw, contractSignedDate: signed,
});

describe("production premium summary", () => {
  it("keeps life premiums monthly and sums all four life products", () => {
    expect(summarizeProductionPremiums([
      entry("neon", 1500, "monthly"), entry("flexi", 2000),
      entry("pillowInjury", 500, "monthly"), entry("maximaMaxEfekt", 700, "monthly"),
    ], start, end)).toEqual({ lifeMonthly: 4700, otherAnnual: 0 });
  });

  it("keeps the calculator's monthly life amount even with legacy annual frequency", () => {
    expect(summarizeProductionPremiums([entry("neon", 1428, "annual")], start, end).lifeMonthly).toBe(1428);
  });

  it("annualizes non-life installments for each payment frequency", () => {
    expect(summarizeProductionPremiums([
      entry("pillowAuto", 1000, "monthly"), entry("domex", 2000, "quarterly"),
      entry("koopmajetekobcan", 3000, "semiannual"), entry("cppcestovko", 4000, "annual"),
      entry("cppsimplex", 5000), entry("maxcizinkomplex", 6000, "annual"),
    ], start, end)).toEqual({ lifeMonthly: 0, otherAnnual: 41000 });
  });

  it("uses the same signing-date boundaries and legacy createdAt fallback as production", () => {
    expect(summarizeProductionPremiums([
      { ...entry("neon", 1000), contractSignedDate: start },
      { ...entry("neon", 2000), contractSignedDate: end },
      { ...entry("neon", 3000), contractSignedDate: new Date(2026, 7, 31), createdAt: signed },
      { ...entry("neon", 4000), contractSignedDate: undefined, createdAt: signed },
      { ...entry("neon", 8000), contractSignedDate: undefined },
    ], start, end)).toEqual({ lifeMonthly: 5000, otherAnnual: 0 });
  });

  it("excludes gold, unknown products and invalid amounts without polluting totals", () => {
    expect(summarizeProductionPremiums([
      entry("comfortcc", 100000, "monthly"), { inputAmount: 1000, contractSignedDate: signed },
      entry("neon", NaN), entry("neon", Infinity), entry("domex", -10), entry("neon", 0),
    ], start, end)).toEqual({ lifeMonthly: 0, otherAnnual: 0 });
  });

  it("uses the stored premium rather than the refresh commission base", () => {
    const refresh = { ...entry("neon", 1428, "monthly"), commissionBaseAnnual: 10758, items: [{ amount: 1021.48 }] };
    expect(summarizeProductionPremiums([refresh], start, end)).toEqual({ lifeMonthly: 1428, otherAnnual: 0 });
  });
});
