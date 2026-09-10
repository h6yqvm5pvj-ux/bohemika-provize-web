import { describe, expect, it } from "vitest";
import { calculateCommission } from "./calculateCommission";
import { inheritedCommissionResult, withInheritedCommissionItems } from "./inheritedContracts";

describe("inherited commission entitlement", () => {
  it("keeps subsequent and servicing commissions, excluding deferred acquisition instalments", () => {
    const result = inheritedCommissionResult({ total: 9999, items: [
      { title: "Provize A101", amount: 1000, code: "A101" },
      { title: "Provize B0301", amount: 200, code: "B0301" },
      { title: "Provize po 3 letech", amount: 300, code: "B3601" },
      { title: "Provize po 4 letech", amount: 400, code: "B4801" },
      { title: "Následná provize (2.–5. rok)", amount: 10, code: "B101-B104" },
      { title: "Pečovatelská provize (5.–10. rok)", amount: 20, code: "B201-B206" },
    ] });
    expect(result.items.map((item) => item.code)).toEqual(["B101-B104", "B201-B206"]);
    expect(result.total).toBe(160);
  });

  it("counts formerly informational recurring rows without duplicating annual summaries", () => {
    const result = inheritedCommissionResult({ total: 1000, items: [
      { title: "Okamžitá provize (z platby)", amount: 100, code: "A101" },
      { title: "Následná provize (z platby)", amount: 25, code: "B101", excludeFromTotal: true },
      { title: "Okamžitá provize za rok", amount: 400 },
      { title: "Následná provize za rok", amount: 100, excludeFromTotal: true },
    ] });
    expect(result.total).toBe(100);
    expect(inheritedCommissionResult(result)).toEqual(result);
  });

  it("uses the original position in the existing product formula", () => {
    const calculate = (position: "poradce4" | "manazer8") => {
      const result = calculateCommission({ productKey: "cppAuto", position, inputAmount: 2000,
        frequencyRaw: "quarterly", contractSignedDateIso: "2024-05-01", commissionMode: "standard",
        durationYears: null, durationMonths: null, maxCizinKomplexVariant: null,
        comfortPayment: null, comfortGradual: null, comfortTargetAmount: null });
      expect(result).not.toBeNull();
      return inheritedCommissionResult(result!);
    };
    const original = calculate("poradce4");
    expect(original.total).toBeGreaterThan(0);
    expect(original.items[0].amount).not.toBe(calculate("manazer8").items[0].amount);
  });

  it("reapplies entitlement to recalculated records and leaves ordinary contracts intact", () => {
    const entry = { result: { items: [{ title: "Okamžitá provize", amount: 100 }], total: 100 } };
    expect(withInheritedCommissionItems(entry)).toBe(entry);
    expect(withInheritedCommissionItems({ ...entry, acquisitionType: "inherited" as const })).toMatchObject({
      items: [], total: 0, result: { items: [], total: 0 },
    });
    expect(entry.result.items).toHaveLength(1);
  });
});
