import { describe, expect, it } from "vitest";
import { calculatePermanentInjuryBenefit } from "./permanentInjuryBenefit";

describe("ČPP tenfold permanent injury benefit", () => {
  it("matches ČPP’s published 26% example with CZK 500,000 insured", () => {
    expect(calculatePermanentInjuryBenefit(500_000, 26)).toEqual({ multiplier: 3, baseBenefit: 130_000, progressiveBenefit: 390_000 });
  });

  it.each([
    [10, 1, 50_000], [11, 2, 110_000],
    [20, 2, 200_000], [21, 3, 315_000],
    [50, 5, 1_250_000], [90, 9, 4_050_000],
    [91, 10, 4_550_000], [100, 10, 5_000_000],
  ])("applies the full coefficient at %i%%", (percent, multiplier, progressiveBenefit) => {
    expect(calculatePermanentInjuryBenefit(500_000, percent)).toMatchObject({ multiplier, progressiveBenefit });
  });

  it("keeps the selected insured amount in the calculation", () => {
    expect(calculatePermanentInjuryBenefit(2_000_000, 26)?.progressiveBenefit).toBe(1_560_000);
  });

  it.each([
    [0, 26], [-500_000, 26], [Number.NaN, 26], [Infinity, 26], [5_000_001, 26],
    [500_000, 0], [500_000, 101], [500_000, 10.5], [500_000, Number.NaN], [500_000, Infinity],
  ])("rejects inputs outside the educational model (%s, %s)", (amount, percent) => {
    expect(calculatePermanentInjuryBenefit(amount, percent)).toBeNull();
  });
});
