import { describe, expect, it } from "vitest";

import {
  baseCommissionCodeForPayoutComparison,
  isHigherCommissionPayout,
  isFirstYearAutoACommissionPayout,
  isNeonInvestmentLifeA201Payout,
  isNeonRefreshStatementProductCode,
} from "./commissionPayoutRules";

describe("product-specific commission code comparison", () => {
  it.each(["C101", "C102", "C103", "C111", "C1100"])("maps Kooperativa Auto %s to the same B installment", code => {
    expect(baseCommissionCodeForPayoutComparison(code, "kooperativaAuto")).toBe(`B${code.slice(1)}`);
  });
  it("normalizes case and whitespace without mutating statement codes", () => {
    const source = { code: " c 102 " };
    expect(baseCommissionCodeForPayoutComparison(source.code, "kooperativaAuto")).toBe("B102");
    expect(source.code).toBe(" c 102 ");
    expect(baseCommissionCodeForPayoutComparison("APZ101", "kooperativaAuto")).toBe("A101");
  });
  it.each(["cppAuto", "koopflotila", "neon", undefined] as const)("preserves C codes without the supported product rule (%s)", product => {
    expect(baseCommissionCodeForPayoutComparison("C102", product)).toBe("C102");
  });
  it.each(["C201", "C102-C104", "C102suffix", "C10"])("does not map unrelated or malformed code %s", code => {
    expect(baseCommissionCodeForPayoutComparison(code, "kooperativaAuto")).toBe(code.toUpperCase());
  });
});

describe("higher commission payouts", () => {
  it("distinguishes a positive higher payment from an underpayment or an unknown expectation", () => {
    expect(isHigherCommissionPayout({ amount: 140, expectedAmount: 100, tolerance: 10 })).toBe(true);
    for (const expectedAmount of [null, undefined, 0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isHigherCommissionPayout({ amount: 140, expectedAmount, tolerance: 10 })).toBe(false);
    }
    for (const amount of [-140, 0, 60, 100, 110, Number.NaN]) {
      expect(isHigherCommissionPayout({ amount, expectedAmount: 100, tolerance: 10 })).toBe(false);
    }
  });
});

describe("isNeonRefreshStatementProductCode", () => {
  it("recognizes NEON refresh product codes used in statements", () => {
    expect(isNeonRefreshStatementProductCode("CPP_NEONRF")).toBe(true);
    expect(isNeonRefreshStatementProductCode(" CPP_NRF_LF ")).toBe(true);
    expect(isNeonRefreshStatementProductCode("CPP_NRF_IN")).toBe(true);
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
