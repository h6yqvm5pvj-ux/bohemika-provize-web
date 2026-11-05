import { describe, expect, it } from "vitest";
import { calculateDomexNeuron } from "../lib/productFormulas/domexNeuron";
import { generateCashflow } from "./generator";
import type { EntryDoc } from "./types";

const asOf = new Date(2026, 10, 5);
const change = (date: string, payment: number) => ({
  effectiveDate: date, paymentPremium: payment,
});
const fixture = (overrides: Partial<EntryDoc> = {}): EntryDoc => ({
  id: "neuron-history", userEmail: "owner@example.test", productKey: "domexneuron", source: "own",
  inputAmount: 10000, calculationInputAmount: 10000, effectiveInputAmount: 12000,
  frequencyRaw: "annual", policyStartDate: "2026-11-05", contractSignedDate: "2026-11-04",
  ...calculateDomexNeuron(10000, "annual", "poradce1"),
  premiumIndexationHistory: [change("2028-11-05", 12000), change("2027-11-05", 11000)],
  ...overrides,
});
const forecast = (entry: EntryDoc) => generateCashflow([entry], 5, entry.source === "manager" ? "manager@example.test" : entry.userEmail, asOf);

describe("confirmed DOMEX Neuron indexation cashflow", () => {
  it("preserves initial A commissions and applies each confirmed increase from its anniversary", () => {
    const entry = fixture();
    const before = structuredClone(entry);
    const rows = forecast(entry);
    expect(rows.filter(row => row.commissionCode?.startsWith("A")).map(row => row.amount)).toEqual([1108]);
    expect(rows.filter(row => row.commissionCode?.startsWith("B")).map(row => [row.commissionPeriodStart, row.amount])).toEqual([
      ["2027-11-05", 305.8], ["2028-11-05", 333.6], ["2029-11-05", 333.6], ["2030-11-05", 333.6],
    ]);
    expect(entry).toEqual(before);
  });

  it("leaves older unconfirmed B periods at the original premium", () => {
    const rows = forecast(fixture({ premiumIndexationHistory: [change("2028-11-05", 12000)] }));
    expect(rows.filter(row => row.commissionCode?.startsWith("B")).map(row => row.amount)).toEqual([278, 333.6, 333.6, 333.6]);
  });

  it.each(["semiannual", "quarterly", "monthly"] as const)("applies the new per-payment premium to every %s B installment", frequencyRaw => {
    const entry = fixture({ frequencyRaw, inputAmount: 1000, calculationInputAmount: 1000,
      effectiveInputAmount: 1100, ...calculateDomexNeuron(1000, frequencyRaw, "poradce1"),
      premiumIndexationHistory: [change("2027-11-05", 1100)],
    });
    const rows = forecast(entry);
    expect(rows.filter(row => row.commissionCode?.startsWith("A")).every(row => row.amount === 110.8)).toBe(true);
    const subsequent = rows.filter(row => row.commissionCode?.startsWith("B"));
    expect(subsequent.length).toBeGreaterThan(3);
    expect(subsequent.every(row => row.amount === 30.58)).toBe(true);
  });

  it("scales the manager's stored B difference without adding the owner's commission", () => {
    const rows = forecast(fixture({ source: "manager", items: [
      { title: "Okamžitá provize A101 (z platby)", code: "A101", amount: 200 },
      { title: "Následná provize (z platby)", code: "B101", amount: 50, excludeFromTotal: true },
    ] }));
    expect(rows.filter(row => row.commissionCode?.startsWith("A")).map(row => row.amount)).toEqual([200]);
    expect(rows.filter(row => row.commissionCode?.startsWith("B")).map(row => row.amount)).toEqual([55, 60, 60, 60]);
  });

  it("preserves an actual statement payment instead of rewriting it to the indexed forecast", () => {
    const rows = forecast(fixture({ commissionPayouts: [{
      key: "actual-b101", code: "B101", status: "paid", amount: 300,
      payoutMonthKey: "2027-12", writtenBy: "owner@example.test",
    }] }));
    const first = rows.filter(row => row.commissionCode === "B101");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ amount: 300, payoutStatus: "paid", commissionPayoutKey: "actual-b101" });
  });

  it("does not invent an increase from effectiveInputAmount when no indexation was confirmed", () => {
    const rows = forecast(fixture({ premiumIndexationHistory: [] }));
    expect(rows.filter(row => row.commissionCode?.startsWith("B")).every(row => row.amount === 278)).toBe(true);
  });
});
