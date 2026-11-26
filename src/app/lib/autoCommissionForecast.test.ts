import { describe, expect, it } from "vitest";
import { autoCommissionPolicyYear, createAutoCommissionForecast } from "./autoCommissionForecast";

const contract = {
  productKey: "kooperativaAuto" as const, policyStartDate: "2023-09-01", frequencyRaw: "quarterly" as const,
  items: [{ code: "A101", title: "Okamžitá provize", amount: 138.5848 }],
  paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual" as const }],
};

describe("rolling auto renewal estimates", () => {
  it("uses the clamped anniversary for policies starting on leap day", () => {
    const leap = { ...contract, policyStartDate: "2024-02-29" };
    expect(autoCommissionPolicyYear(leap, "2025-02-27")).toBe(1);
    expect(autoCommissionPolicyYear(leap, "2025-02-28")).toBe(2);
    expect(autoCommissionPolicyYear(leap, "2026-02-28")).toBe(3);
  });
  it("starts with the known first-year payment rounded to currency precision and changes the payment frequency", () => {
    const model = createAutoCommissionForecast(contract, []);
    expect(model.forPeriod("B101", "2024-09-01")).toMatchObject({ amount: 554.32, minimum: 509.97, maximum: 598.67, basis: "initial" });
    expect(model.inForecastYear("2024-09-01")).toBe(true);
    expect(model.inForecastYear("2025-09-01")).toBe(false);
  });

  it("sums corrections and split receipts belonging to one entitlement and uses their actual amount", () => {
    const receipts = [
      { code: "C101", amount: 559.8, status: "paid" },
      { code: "B101", amount: 22.04, status: "difference" },
    ];
    const before = structuredClone(receipts);
    const model = createAutoCommissionForecast(contract, receipts);
    expect(model.forPeriod("B102", "2025-09-01")).toMatchObject({ amount: 581.84, minimum: 535.29, maximum: 628.39, basis: "receipt", basisAmount: 581.84 });
    expect(model.inForecastYear("2025-09-01")).toBe(true);
    expect(model.inForecastYear("2026-09-01")).toBe(false);
    expect(receipts).toEqual(before);
  });

  it("replaces the basis with each newly paid policy period, without leaking a later correction into another year", () => {
    const model = createAutoCommissionForecast(contract, [
      { code: "C101", amount: 559.8, status: "paid" }, { code: "C102", amount: 654, status: "paid" },
      { code: "B101", amount: 22.04, status: "difference" },
    ]);
    expect(model.forPeriod("B102", "2025-09-01")?.amount).toBe(581.84);
    expect(model.forPeriod("B103", "2026-09-01")).toMatchObject({ amount: 654, minimum: 601.68, maximum: 706.32 });
    expect(model.inForecastYear("2027-09-01")).toBe(false);
  });

  it("estimates all four installments of the nearest annual term from the same actual basis", () => {
    const quarterly = { ...contract, paymentFrequencyChanges: [] };
    const model = createAutoCommissionForecast(quarterly, [{ code: "C104", amount: 150, status: "paid" }]);
    for (const [code, period] of [["B105", "2025-09-01"], ["B106", "2025-12-01"], ["B107", "2026-03-01"], ["B108", "2026-06-01"]]) {
      expect(model.inForecastYear(period)).toBe(true);
      expect(model.forPeriod(code, period)).toMatchObject({ amount: 150, minimum: 138, maximum: 162 });
    }
    expect(model.inForecastYear("2026-09-01")).toBe(false);
  });

  it("normalizes a paid annual commission into quarterly installments while preserving its annual basis", () => {
    const switched = { ...contract, frequencyRaw: "annual" as const, paymentFrequencyChanges: [{ effectiveDate: "2025-09-01", frequency: "quarterly" as const }] };
    const model = createAutoCommissionForecast(switched, [{ code: "C101", amount: 600, status: "paid" }]);
    expect(model.forPeriod("B102", "2025-09-01")?.amount).toBe(150);
  });

  it("uses the confirmed amount for remaining installments in the same policy year, reserving the range for the next anniversary", () => {
    const quarterly = { ...contract, paymentFrequencyChanges: [] };
    const model = createAutoCommissionForecast(quarterly, [
      { code: "C104", amount: 435.46, status: "paid" },
      { code: "C105", amount: 365.01, status: "paid" }, { code: "C106", amount: 365.01, status: "paid" },
    ]);
    for (const [code, period] of [["B107", "2026-03-01"], ["B108", "2026-06-01"]]) {
      expect(model.forPeriod(code, period)).toMatchObject({ amount: 365.01, minimum: 365.01, maximum: 365.01, isConfirmedPolicyYear: true });
    }
    expect(model.forPeriod("B109", "2026-09-01")).toMatchObject({ amount: 365.01, minimum: 335.81, maximum: 394.21, isConfirmedPolicyYear: false });
  });

  it("redistributes a confirmed annual basis when payment frequency changes during the same policy year", () => {
    const changed = { ...contract, paymentFrequencyChanges: [{ effectiveDate: "2025-03-01", frequency: "semiannual" as const }] };
    const model = createAutoCommissionForecast(changed, [{ code: "C101", amount: 365.01, status: "paid" }]);
    expect(model.forPeriod("B103", "2025-03-01")).toMatchObject({ amount: 730.02, minimum: 730.02, maximum: 730.02, isConfirmedPolicyYear: true });
  });

  it("removes cancelled receipts from the next estimate and accounts for partial reversals", () => {
    const model = createAutoCommissionForecast(contract, [
      { code: "C101", amount: 600, status: "paid" }, { code: "C101", amount: -100, status: "storno" },
      { code: "C102", amount: 700, status: "paid" }, { code: "C102", amount: 700, status: "storno" },
    ]);
    expect(model.forPeriod("B102", "2025-09-01")?.amount).toBe(500);
    expect(model.inForecastYear("2026-09-01")).toBe(false);
  });
});

describe("manual auto premium change", () => {
  it("uses the signing position and rate from the effective date and follows later payment frequencies", () => {
    const changed = {
      ...contract, frequencyRaw: "semiannual" as const, policyStartDate: "2024-01-29",
      contractSignedDate: "2024-01-22", originalPosition: "poradce7" as const, position: "poradce10" as const,
      paymentFrequencyChanges: [
        { effectiveDate: "2026-01-29", frequency: "annual" as const, annualPremium: 22037, baseAnnualPremium: 24000 },
        { effectiveDate: "2027-01-29", frequency: "quarterly" as const },
        { effectiveDate: "2028-01-29", frequency: "annual" as const, annualPremium: 20000, baseAnnualPremium: 24000 },
      ],
    };
    const receipts = [{ code: "B101", amount: 2511.11 }, { code: "B102", amount: 2499.99 }];
    const forecast = createAutoCommissionForecast(changed, receipts);
    expect(forecast.forPeriod("B102", "2025-07-29")).toMatchObject({ basis: "receipt" });
    expect(forecast.forPeriod("B103", "2026-01-29")).toMatchObject({
      basis: "premiumChange", position: "poradce7", amount: 1859.92, minimum: 1859.92, maximum: 1859.92,
    });
    expect(forecast.forPeriod("B104", "2027-01-29")?.amount).toBe(464.98);
    expect(forecast.inForecastYear("2028-01-29")).toBe(true);
    expect(forecast.forPeriod("B108", "2028-01-29")?.amount).toBe(1688);
    expect(createAutoCommissionForecast({ ...changed, commissionCoefficientSetOverride: "current" }, receipts)
      .forPeriod("B103", "2026-01-29")?.amount).toBe(2468.14);
    expect(createAutoCommissionForecast({ ...changed, source: "manager" }, receipts)
      .forPeriod("B103", "2026-01-29")).toMatchObject({ basis: "receipt", isConfirmedPolicyYear: false });
    expect(createAutoCommissionForecast({ ...changed, contractSignedDate: undefined }, receipts)
      .forPeriod("B103", "2026-01-29")).toMatchObject({ basis: "receipt" });
  });

  const cpp = { productKey: "cppAuto" as const, frequencyRaw: "annual" as const, policyStartDate: "2023-09-01", inputAmount: 10000,
    items: [{ code: "A101", title: "Okamžitá provize", amount: 1000 }],
    paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual" as const, annualPremium: 3000, baseAnnualPremium: 10000 }] };
  it("uses the subsequent commission rate for 10000 -> 3000 without changing the paid A101", () => {
    const receipts = [{ code: "A101", amount: 1000, status: "paid" }];
    const before = structuredClone({ cpp, receipts });
    const forecast = createAutoCommissionForecast(cpp, receipts, 800);
    expect(forecast.forPeriod("B101", "2024-09-01")?.amount).toBe(240);
    expect({ cpp, receipts }).toEqual(before);
  });
  it("combines a premium reduction with annual -> quarterly payments", () => {
    const changed = { ...cpp, paymentFrequencyChanges: [{ ...cpp.paymentFrequencyChanges[0], frequency: "quarterly" as const }] };
    expect(createAutoCommissionForecast(changed, [], 800).forPeriod("B101", "2024-09-01")?.amount).toBe(60);
  });
  it("scales from the premium applicable to the last receipt and never applies a reduction twice", () => {
    const model = createAutoCommissionForecast(cpp, [{ code: "B101", amount: 240, status: "paid" }], 800);
    expect(model.forPeriod("B102", "2025-09-01")?.amount).toBe(240);
    const raised = { ...cpp, paymentFrequencyChanges: [...cpp.paymentFrequencyChanges, { effectiveDate: "2025-09-01", frequency: "annual" as const, annualPremium: 6000, baseAnnualPremium: 10000 }] };
    expect(createAutoCommissionForecast(raised, [{ code: "B101", amount: 240, status: "paid" }], 800).forPeriod("B102", "2025-09-01")?.amount).toBe(480);
  });
  it("does not alter a period before the effective date, including an off-cycle premium-only change", () => {
    const changed = { ...cpp, paymentFrequencyChanges: [{ ...cpp.paymentFrequencyChanges[0], effectiveDate: "2025-01-01" }] };
    const model = createAutoCommissionForecast(changed, [], 800);
    expect(model.forPeriod("B101", "2024-09-01")?.amount).toBe(800);
    expect(model.forPeriod("B102", "2025-09-01")?.amount).toBe(240);
  });
});
