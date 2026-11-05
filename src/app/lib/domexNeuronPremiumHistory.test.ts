import { describe, expect, it } from "vitest";
import { createDomexNeuronPremiumTimeline, domexNeuronPremiumAtDate, domexNeuronPremiumRatioAtDate, scaleDomexNeuronSubsequentItems } from "./domexNeuronPremiumHistory";
import type { CommissionResultItemDTO } from "../types/domain";

const contract = {
  productKey: "domexneuron", frequencyRaw: "semiannual", inputAmount: 1000, effectiveInputAmount: 1200,
  premiumStatementHistory: [
    { premiumKind: "auto_change", changeReason: "indexation", anniversaryDate: "2028-11-05", validFrom: "2026-11-05", newPremium: 1200 },
    { premiumKind: "auto_change", changeReason: "indexation", anniversaryDate: "2027-11-05", validFrom: "2026-11-05", newPremium: 1100 },
  ],
};

describe("confirmed DOMEX Neuron premium history", () => {
  it.each([
    ["2026-11-05", 1000], ["2027-11-04", 1000], ["2027-11-05", 1100],
    ["2028-11-04", 1100], ["2028-11-05", 1200], ["2031-01-01", 1200],
  ])("uses the confirmed premium effective at %s", (date, expected) => {
    expect(domexNeuronPremiumAtDate(contract, date)).toBe(expected);
    expect(domexNeuronPremiumRatioAtDate(contract, date)).toBe(expected / 1000);
  });

  it("keeps a confirmed historical increase after the indexation option is disabled", () => {
    const disabled = { ...contract, premiumIndexationEnabled: false };
    expect(domexNeuronPremiumAtDate(disabled, "2029-01-01")).toBe(1200);
  });

  it("does not substitute a future effectiveInputAmount without a confirmed history", () => {
    expect(domexNeuronPremiumAtDate({ ...contract, premiumStatementHistory: [] }, "2030-01-01")).toBe(1000);
  });

  it("uses the known annual premium when no per-payment premium was saved", () => {
    const annualOnly = { ...contract, premiumStatementHistory: [
      { premiumKind: "auto_change", changeReason: "indexation", anniversaryDate: "2027-11-05", newAnnualPremium: 2200 },
    ] };
    expect(domexNeuronPremiumAtDate(annualOnly, "2027-11-05")).toBe(1100);
  });

  it("uses the most recent confirmation for a shared effective date", () => {
    const corrected = { ...contract, premiumStatementHistory: [
      { ...contract.premiumStatementHistory[1], newPremium: 1150, writtenAtMs: 200 },
      { ...contract.premiumStatementHistory[1], newPremium: 1100, writtenAtMs: 100 },
    ] };
    expect(domexNeuronPremiumAtDate(corrected, "2027-11-05")).toBe(1150);
  });

  it("prefers the shared policy projection over the recipient's partial statement history", () => {
    const projected = { ...contract, premiumIndexationHistory: [{ effectiveDate: "2027-11-05", paymentPremium: 1150 }] };
    expect(domexNeuronPremiumAtDate(projected, "2029-01-01")).toBe(1150);
    expect(domexNeuronPremiumAtDate({ ...projected, premiumIndexationHistory: [] }, "2029-01-01")).toBe(1000);
  });

  it.each([
    { changeReason: undefined }, { premiumKind: "life_increase" }, { newPremium: -1 },
    { newPremium: "1100" }, { anniversaryDate: "2027-02-30" }, { anniversaryDate: {} },
  ])("ignores an unconfirmed or malformed history entry: %j", patch => {
    const malformed = { ...contract, premiumStatementHistory: [{ ...contract.premiumStatementHistory[1], ...patch }] };
    expect(domexNeuronPremiumAtDate(malformed, "2029-01-01")).toBe(1000);
  });

  it("does not apply Neuron changes to another product or mutate the stored history", () => {
    const before = structuredClone(contract);
    expect(domexNeuronPremiumAtDate({ ...contract, productKey: "domex" }, "2029-01-01")).toBe(1000);
    createDomexNeuronPremiumTimeline(contract);
    expect(contract).toEqual(before);
  });

  it("scales only the dated B display and preserves acquisition rows, totals and the source items", () => {
    const items: CommissionResultItemDTO[] = [
      { title: "Okamžitá provize (z platby)", code: "A101", amount: 110.8 },
      { title: "Následná provize (z platby)", code: "B101", amount: 27.8, excludeFromTotal: true },
      { title: "Následná provize za rok", amount: 55.6, excludeFromTotal: true },
      { title: "Servisní provize", code: "B201", amount: 5, excludeFromTotal: true },
      { title: "Celkem", code: "TOTAL", amount: 221.6 },
    ];
    const before = structuredClone(items);
    const projected = scaleDomexNeuronSubsequentItems(contract, items, "2027-11-05");
    expect(projected.map(item => item.amount)).toEqual([110.8, 30.58, 61.16, 5.5, 221.6]);
    expect(projected[1].excludeFromTotal).toBe(true);
    expect(items).toEqual(before);
    expect(scaleDomexNeuronSubsequentItems(contract, items, "2027-11-04")).toEqual(items);
    expect(scaleDomexNeuronSubsequentItems({ ...contract, productKey: "domex" }, items, "2029-01-01")).toEqual(items);
  });
});
