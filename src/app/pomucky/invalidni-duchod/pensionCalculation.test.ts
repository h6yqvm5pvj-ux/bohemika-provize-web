import { describe, expect, it } from "vitest";
import { buildPensionSummary, calculateDisabilityPension, parsePensionNumber, reduceAssessmentBase, type MinimumMode } from "./pensionCalculation";

const calculate = (monthlyIncome: number, creditedYears: number, minimumMode: MinimumMode = "ordinary") =>
  calculateDisabilityPension({ monthlyIncome, creditedYears, minimumMode });
const totals = (monthlyIncome: number, creditedYears: number, minimumMode: MinimumMode = "ordinary") =>
  calculate(monthlyIncome, creditedYears, minimumMode).pensions.map((pension) => pension.total);

describe("invalidní důchod nově přiznaný v roce 2026", () => {
  it("uses the 2026 rate and reductions in a hand-calculated example", () => {
    // 21 546 × .99 + 18 454 × .26 = 26 128.58 -> 26 129.
    // 26 129 × 45 × .01495 = 17 578.28475; then divide and ceil each degree.
    const result = calculate(40_000, 45);
    expect(result.reducedBase).toBe(26_129);
    expect(result.pensions.map((pension) => pension.earnedPercentage)).toEqual([5_860, 8_790, 17_579]);
    expect(result.pensions.map((pension) => pension.total)).toEqual([10_760, 13_690, 22_479]);
    expect(result.pensions.every((pension) => pension.basicAmount === 4_900)).toBe(true);
  });

  it("does not halve or divide the shared basic component", () => {
    expect(totals(30_000, 30)).toEqual([8_418, 10_177, 15_453]);
  });

  it.each([
    [21_545, 21_330], [21_546, 21_331], [21_547, 21_331],
    [195_867, 66_654], [195_868, 66_655], [195_869, 66_655],
  ])("handles the reduction boundary at %s CZK", (income, expected) => {
    expect(reduceAssessmentBase(income).reducedBase).toBe(expected);
  });

  it("ignores earnings above the second threshold", () => {
    expect(totals(500_000, 45)).toEqual(totals(195_868, 45));
    expect(reduceAssessmentBase(500_000).excluded).toBe(304_132);
  });

  it("rounds the input OVZ up before applying reductions", () => {
    expect(reduceAssessmentBase(20_000.01)).toMatchObject({ assessmentBase: 20_001, reducedBase: 19_801 });
  });

  it("applies each statutory minimum even at zero earnings or zero full credited years", () => {
    expect(totals(0, 45)).toEqual([6_534, 7_350, 9_800]);
    expect(totals(40_000, 0)).toEqual([6_534, 7_350, 9_800]);
    expect(calculate(0, 45).pensions.every((pension) => pension.minimumApplied)).toBe(true);
  });

  it.each(["insured15", "under28"] as const)("handles the protected minimum for %s", (mode) => {
    // 48 967 reduced to 28 460; 45% = 12 807; half = 6 403.5; third = 4 269.
    expect(totals(10_000, 15, mode)).toEqual([9_169, 11_304, 17_707]);
    expect(calculate(10_000, 15, mode).pensions.every((pension) => pension.minimumApplied)).toBe(true);
    expect(totals(40_000, 45, mode)).toEqual([10_760, 13_690, 22_479]);
  });

  it("does not infer fifteen years of actual insurance from total credited years", () => {
    expect(totals(10_000, 45)).toEqual([7_121, 8_231, 11_561]);
    expect(totals(10_000, 45, "insured15")).toEqual([9_169, 11_304, 17_707]);
    expect(() => calculate(10_000, 14, "insured15")).toThrow(/15/);
  });

  it("rejects invalid amounts, non-whole years and unknown minimum modes", () => {
    for (const income of [NaN, Infinity, -1, 10_000_001]) expect(() => calculate(income, 45)).toThrow(RangeError);
    for (const years of [NaN, Infinity, -1, 45.5, 61]) expect(() => calculate(40_000, years)).toThrow(RangeError);
    expect(() => calculate(40_000, 45, "toString" as MinimumMode)).toThrow(RangeError);
  });

  it("parses Czech amounts and rejects empty, malformed and exponent inputs", () => {
    expect(parsePensionNumber(" 40 000,50 ")).toBe(40_000.5);
    expect(parsePensionNumber("40\u00a0000")).toBe(40_000);
    expect(parsePensionNumber("0")).toBe(0);
    for (const value of ["", " ", "-1", "1e5", "Infinity", "40,00,0", "400 Kč", "1.000.000", "abc"]) {
      expect(parsePensionNumber(value)).toBeNull();
    }
  });

  it("copies assumptions, all degrees, minimum adjustments and limits with the amounts", () => {
    const summary = buildPensionSummary(calculate(10_000, 15, "insured15"), "gross").replaceAll("\u00a0", " ");
    expect(summary).toContain("roce 2026");
    expect(summary).toContain("Hrubý měsíční příjem použitý jako odhad OVZ: 10 000 Kč");
    expect(summary).toContain("III. stupeň: 17 707 Kč");
    expect(summary).toContain("dorovnáno na zvolené minimum");
    expect(summary).toContain("Nárok ani stupeň invalidity tato kalkulačka neposuzuje");
    expect(summary).toContain("https://www.cssz.gov.cz/invalidni-duchody-podrobne");
    const knownSummary = buildPensionSummary(calculate(40_000, 45), "assessment");
    expect(knownSummary).toContain("Osobní vyměřovací základ:");
    expect(knownSummary).not.toContain("Hrubý měsíční příjem");
  });
});
