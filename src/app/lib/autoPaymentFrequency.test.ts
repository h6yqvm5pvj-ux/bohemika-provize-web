import { allowedFrequencies } from "@/app/kalkulacka/calculatorHelpers";
import { PRODUCT_ORDER, isAutoProduct } from "./productCatalog";
import { describe, expect, it } from "vitest";
import { autoFrequencyCommissionPeriods, autoFrequencyCommissionMultiplier, autoPaymentFrequencies, normalizePaymentFrequencyChanges, paymentFrequencyAtDate } from "./autoPaymentFrequency";
import { commissionPeriodForCode } from "./commissionPeriodForCode";
import { generateCashflow } from "@/app/cashflow/generator";
import type { EntryDoc } from "@/app/cashflow/types";

const entry: EntryDoc = {
  id: "synthetic-frequency-change", userEmail: "advisor@example.test", source: "own", productKey: "kooperativaAuto",
  policyStartDate: "2023-09-01", contractSignedDate: "2023-09-01", frequencyRaw: "quarterly", inputAmount: 1642,
  items: [{ title: "Okamžitá provize", code: "A101", amount: 100 }, { title: "Následná provize", code: "B101", amount: 100, excludeFromTotal: true }],
  paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual" }],
};

describe("dated auto payment frequency changes", () => {
  it("keeps four original first-year installments, then one annual commission with a continuous B sequence", () => {
    const periods = autoFrequencyCommissionPeriods(entry, "2026-12-31");
    expect(periods.map(row => [row.code, row.period])).toEqual([
      ["A101", "2023-09-01"], ["A102", "2023-12-01"], ["A103", "2024-03-01"], ["A104", "2024-06-01"],
      ["B101", "2024-09-01"], ["B102", "2025-09-01"], ["B103", "2026-09-01"],
    ]);
    expect(entry.frequencyRaw).toBe("quarterly");
    expect(paymentFrequencyAtDate(entry, "2024-08-31")).toBe("quarterly");
    expect(paymentFrequencyAtDate(entry, "2024-09-01")).toBe("annual");
    expect(commissionPeriodForCode(entry, "C102")).toBe("2025-09-01");
    expect(commissionPeriodForCode(entry, "B103")).toBe("2026-09-01");
    expect(commissionPeriodForCode(entry, "B2")).toBe("2025-09-01");
  });

  it("keeps the annual base and received amounts while redistributing expected installments", () => {
    const source = { ...entry, commissionPayouts: [{ key: "actual", code: "C101", amount: 450, status: "paid", payoutMonthKey: "2024-9", writtenBy: "advisor@example.test" }] };
    const before = structuredClone(source);
    const rows = generateCashflow([source], 3, "advisor@example.test", new Date(2024, 0, 1));
    expect(rows.filter(row => row.commissionCode?.startsWith("A"))).toHaveLength(4);
    const subsequent = rows.filter(row => ["B101", "B102", "B103", "C101"].includes(row.commissionCode ?? ""));
    expect(subsequent.find(row => row.commissionCode === "C101")).toMatchObject({ amount: 450, predictedAmount: 400, payoutStatus: "paid", commissionPeriodStart: "2024-09-01" });
    expect(subsequent.find(row => row.commissionCode === "B102")).toMatchObject({ amount: 400, frequency: "annual", commissionPeriodStart: "2025-09-01" });
    expect(rows.filter(row => row.commissionPeriodStart?.startsWith("2025"))).toHaveLength(1);
    expect(source).toEqual(before);
  });

  it("reallocates the same annual commission when frequency changes in either direction", () => {
    expect(autoFrequencyCommissionMultiplier(entry, "2024-08-31")).toBe(1);
    expect(autoFrequencyCommissionMultiplier(entry, "2024-09-01")).toBe(4);
    const annual = { ...entry, frequencyRaw: "annual" as const, paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "quarterly" as const }] };
    expect(autoFrequencyCommissionMultiplier(annual, "2024-09-01")).toBe(0.25);
    const multiple = { ...entry, paymentFrequencyChanges: [...entry.paymentFrequencyChanges!, { effectiveDate: "2025-09-01", frequency: "semiannual" as const }] };
    expect(autoFrequencyCommissionMultiplier(multiple, "2025-09-01")).toBe(2);
    const rows = generateCashflow([annual], 3, "advisor@example.test", new Date(2024, 0, 1));
    const year = rows.filter(row => row.commissionPeriodStart && row.commissionPeriodStart >= "2024-09-01" && row.commissionPeriodStart < "2025-09-01");
    expect(year).toHaveLength(4);
    expect(year.map(row => row.amount)).toEqual([25, 25, 25, 25]);
    expect(year.reduce((sum, row) => sum + row.amount, 0)).toBe(100);
  });

  it("also adjusts manager expectations without changing their stored commission base", () => {
    const source = { ...entry, source: "manager" as const, items: entry.items!.map(item => ({ ...item, amount: 25 })) };
    const rows = generateCashflow([source], 3, "manager@example.test", new Date(2024, 0, 1));
    expect(rows.find(row => row.commissionCode === "B102")).toMatchObject({ amount: 100, frequency: "annual", source: "manager" });
    expect(source.items.map(item => item.amount)).toEqual([25, 25]);
  });

  it("supports a second change and does not rewrite the original installment dates", () => {
    const changed = { ...entry, paymentFrequencyChanges: [...entry.paymentFrequencyChanges!, { effectiveDate: "2025-09-01", frequency: "semiannual" as const }] };
    expect(autoFrequencyCommissionPeriods(changed, "2026-04-01").slice(-3).map(row => [row.code, row.period])).toEqual([
      ["B101", "2024-09-01"], ["B102", "2025-09-01"], ["B103", "2026-03-01"],
    ]);
  });

  it("clamps month ends without drifting the later payment days", () => {
    const changed = { ...entry, policyStartDate: "2023-01-31", frequencyRaw: "monthly", paymentFrequencyChanges: [{ effectiveDate: "2024-01-31", frequency: "quarterly" as const }] };
    const periods = autoFrequencyCommissionPeriods(changed, "2024-08-01");
    expect(periods.slice(-3).map(row => row.period)).toEqual(["2024-01-31", "2024-04-30", "2024-07-31"]);
  });

  it("retains the annual commission schedule of products that pay annually regardless of collection frequency", () => {
    for (const productKey of ["allianzAuto", "pillowAuto", "uniqaAuto", "uniqaflotila"] as const) {
      const without = { ...entry, productKey, paymentFrequencyChanges: [] };
      const withChange = { ...without, paymentFrequencyChanges: entry.paymentFrequencyChanges };
      const map = (source: EntryDoc) => generateCashflow([source], 3, "advisor@example.test", new Date(2024, 0, 1)).map(row => [row.date, row.amount, row.commissionCode]);
      expect(map(withChange)).toEqual(map(without));
    }
  });

  it("keeps picker and backend frequencies consistent with the product's calculator", () => {
    for (const product of PRODUCT_ORDER.filter(product => isAutoProduct(product) && product !== "cppAutoVozikZdarma")) {
      expect(autoPaymentFrequencies(product)).toEqual(allowedFrequencies(product));
    }
  });

  it("offers only product-supported frequencies", () => {
    expect(autoPaymentFrequencies("cppAuto")).not.toContain("monthly");
    expect(autoPaymentFrequencies("kooperativaAuto")).toContain("monthly");
    expect(autoPaymentFrequencies("neon")).toEqual([]);
    expect(autoPaymentFrequencies("cppAutoVozikZdarma")).toEqual([]);
  });

  it.each([
    { changes: [{ effectiveDate: "2024-02-30", frequency: "annual" }] },
    { changes: [{ effectiveDate: "2024-09-01", frequency: "daily" }] },
    { changes: [{ effectiveDate: "2025-01-01", frequency: "annual" }, { effectiveDate: "2024-01-01", frequency: "monthly" }] },
  ])("rejects malformed historical changes", ({ changes }) => { expect(() => normalizePaymentFrequencyChanges(changes)).toThrow(); });
});

it("premium-only changes preserve the scheduled dates and commission code sequence", () => {
  const contract = { productKey: "cppAuto" as const, frequencyRaw: "annual" as const, policyStartDate: "2023-09-01", paymentFrequencyChanges: [] };
  const changed = { ...contract, paymentFrequencyChanges: [{ effectiveDate: "2025-01-01", frequency: "annual" as const, annualPremium: 3000, baseAnnualPremium: 10000 }] };
  expect(autoFrequencyCommissionPeriods(changed, "2026-09-01")).toEqual(autoFrequencyCommissionPeriods(contract, "2026-09-01"));
});
