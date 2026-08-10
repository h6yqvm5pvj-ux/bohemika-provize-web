import { describe, expect, it } from "vitest";

import { isNeonInvestmentLifeA201Payout } from "./commissionPayoutRules";

describe("isNeonInvestmentLifeA201Payout", () => {
  it("recognizes the separate NEON investment-life A201 component", () => {
    expect(
      isNeonInvestmentLifeA201Payout({
        product: "neon",
        commissionCode: "A201",
      })
    ).toBe(true);
    expect(
      isNeonInvestmentLifeA201Payout({
        product: "neon",
        commissionCode: " APZ201 ",
      })
    ).toBe(true);
  });

  it("does not suppress other products or the regular A101 component", () => {
    expect(
      isNeonInvestmentLifeA201Payout({
        product: "neon",
        commissionCode: "A101",
      })
    ).toBe(false);
    expect(
      isNeonInvestmentLifeA201Payout({
        product: "flexi",
        commissionCode: "A201",
      })
    ).toBe(false);
  });
});
