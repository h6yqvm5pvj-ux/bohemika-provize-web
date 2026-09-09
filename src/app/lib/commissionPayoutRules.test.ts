import { describe, expect, it } from "vitest";

import {
  hasSmallLifeSubsequentBase,
  payoutHasSmallLifeSubsequentBase,
  isFirstYearAutoACommissionPayout,
  isNeonInvestmentLifeA201Payout,
  isNeonRefreshStatementProductCode,
} from "./commissionPayoutRules";

describe("life subsequent commission base threshold", () => {
  it.each(["B101", "B102", "B104", "B105", "B112", "B199", "B11000"])(
    "uses the base rather than excluding code %s outright", (commissionCode) => {
      expect(hasSmallLifeSubsequentBase({ product: "neon", commissionCode, statementAnnualBase: 600, riskAnnualBase: 19_884 })).toBe(true);
      expect(hasSmallLifeSubsequentBase({ product: "neon", commissionCode, statementAnnualBase: 19_884, riskAnnualBase: 19_884 })).toBe(false);
      expect(hasSmallLifeSubsequentBase({ product: "cppAuto", commissionCode, statementAnnualBase: 600, riskAnnualBase: 19_884 })).toBe(false);
    }
  );

  it.each([null, undefined, 0, -600, Number.NaN, Infinity])("never excludes missing or invalid base %s", (base) => {
    expect(hasSmallLifeSubsequentBase({ product: "neon", commissionCode: "B101", statementAnnualBase: base, riskAnnualBase: 12_000 })).toBe(false);
    expect(hasSmallLifeSubsequentBase({ product: "neon", commissionCode: "B101", statementAnnualBase: 600, riskAnnualBase: base })).toBe(false);
  });

  it("reads a legacy base from its recorded detail without inferring it from commission amounts", () => {
    expect(payoutHasSmallLifeSubsequentBase({ product: "neon", riskAnnualBase: 19_884, payout: {
      code: "B101", detail: "B101: vyplaceno 2,38 Kč, systém 78,74 Kč. Základna výpisu 600,00 Kč.",
    } })).toBe(true);
    expect(payoutHasSmallLifeSubsequentBase({ product: "neon", riskAnnualBase: 19_884, payout: {
      code: "B101", detail: "B101: vyplaceno 2,38 Kč, systém 78,74 Kč.",
    } })).toBe(false);
    expect(payoutHasSmallLifeSubsequentBase({ product: "neon", riskAnnualBase: 19_884, payout: {
      code: "B101", statementBaseAmount: 19_884, detail: "Základna výpisu 600,00 Kč.",
    } })).toBe(false);
  });
});

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
