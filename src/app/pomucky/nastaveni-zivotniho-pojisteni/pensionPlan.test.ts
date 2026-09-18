import { describe, expect, it } from "vitest";
import { calculateInvalidityCover } from "./pensionPlan";
import { INVALIDITY_SCENARIOS } from "./lifeInsuranceShared";
import { evaluatePensionForm } from "../invalidni-duchod/pensionForm";

describe("simple disability coverage variants", () => {
  it("keeps all degrees positive and increasing for the screenshot's income", () => {
    const expected = [[3100, 6200, 9300], [9300, 15500, 24800], [12400, 18600, 31000]];
    expect(INVALIDITY_SCENARIOS).toHaveLength(3);
    INVALIDITY_SCENARIOS.forEach((scenario, index) => {
      const cover = scenario.ratios.map(ratio => calculateInvalidityCover(31000, 22000, 480, ratio));
      expect(cover.map(item => item.monthlyNeed)).toEqual(expected[index]);
      expect(cover.map(item => item.lumpWithoutDebt)).toEqual(expected[index].map(amount => amount * 480));
    });
  });
  it("uses expenses when higher and caps the coverage horizon at zero", () => {
    expect(calculateInvalidityCover(31000, 50000, 480, .3)).toMatchObject({ monthlyNeed: 15000, lumpWithoutDebt: 7200000 });
    expect(calculateInvalidityCover(31000, 22000, -12, .3).lumpWithoutDebt).toBe(0);
    expect(calculateInvalidityCover(0, 0, 480, .3).monthlyNeed).toBe(0);
  });
  it("rejects incomplete personal estimates and an age-incompatible minimum", () => {
    const form = { income: "40000", years: "45", incomeMode: "gross" as const, minimumMode: "ordinary" as const };
    expect(evaluatePensionForm(form, 35).result).not.toBeNull();
    expect(evaluatePensionForm({ ...form, income: "" }, 35).result).toBeNull();
    expect(evaluatePensionForm({ ...form, years: "45.5" }, 35).result).toBeNull();
    expect(evaluatePensionForm({ ...form, minimumMode: "under28" }, 35).result).toBeNull();
    expect(evaluatePensionForm({ ...form, minimumMode: "under28" }, 27).result).not.toBeNull();
  });
});
