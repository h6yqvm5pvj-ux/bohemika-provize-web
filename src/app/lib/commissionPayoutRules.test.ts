import { describe, expect, it } from "vitest";

import {
  isFirstYearAutoACommissionPayout,
  isNeonInvestmentLifeA201Payout,
  isNeonRefreshStatementProductCode,
} from "./commissionPayoutRules";

describe("isNeonRefreshStatementProductCode", () => {
  it("recognizes both NEON refresh product codes used in statements", () => {
    expect(isNeonRefreshStatementProductCode("CPP_NEONRF")).toBe(true);
    expect(isNeonRefreshStatementProductCode(" CPP_NRF_LF ")).toBe(true);
  });

  it("does not classify regular NEON as refresh", () => {
    expect(isNeonRefreshStatementProductCode("CPP_NEON")).toBe(false);
  });
});

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

describe("isFirstYearAutoACommissionPayout", () => {
  it("allows base comparison for initial A commissions on auto products", () => {
    expect(
      isFirstYearAutoACommissionPayout({
        product: "cppAuto",
        commissionCode: "A101",
      })
    ).toBe(true);
    expect(
      isFirstYearAutoACommissionPayout({
        product: "allianzAuto",
        commissionCode: " APZ101 ",
      })
    ).toBe(true);
    expect(
      isFirstYearAutoACommissionPayout({
        product: "csobAuto",
        commissionCode: "AC101",
      })
    ).toBe(true);
  });

  it("rejects anniversary commissions and non-auto products", () => {
    expect(
      isFirstYearAutoACommissionPayout({
        product: "cppAuto",
        commissionCode: "B101",
      })
    ).toBe(false);
    expect(
      isFirstYearAutoACommissionPayout({
        product: "neon",
        commissionCode: "A101",
      })
    ).toBe(false);
  });
});
