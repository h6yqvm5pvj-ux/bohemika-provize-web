import { describe, expect, it } from "vitest";

import {
  calculateCppBytex,
  cppBytexImmediateCoefficient,
  cppBytexSubsequentCoefficient,
  cppBytexSubsequentPayoutYears,
} from "./cppbytex";

describe("CPP BYTEX commission formula", () => {
  it("uses the Bytex coefficient table", () => {
    expect(cppBytexImmediateCoefficient("manazer10")).toBeCloseTo(0.3192, 4);
    expect(cppBytexSubsequentCoefficient("manazer10")).toBeCloseTo(0.0798, 4);
    expect(cppBytexImmediateCoefficient("poradce1")).toBeCloseTo(0.1053, 4);
    expect(cppBytexSubsequentCoefficient("poradce1")).toBeCloseTo(0.0263, 4);
  });

  it("calculates per-payment and annual values without commission mode", () => {
    const result = calculateCppBytex(1000, "quarterly", "poradce4");

    expect(result.total).toBeCloseTo(637.6, 2);
    expect(result.items[0]).toMatchObject({ code: "A101-A104" });
    expect(result.items[0]?.amount).toBeCloseTo(159.4, 2);
    expect(result.items[1]).toMatchObject({
      code: "B101-B104",
      excludeFromTotal: true,
    });
    expect(result.items[1]?.amount).toBeCloseTo(39.8, 2);
    expect(result.items[2]?.amount).toBeCloseTo(637.6, 2);
    expect(result.items[3]).toMatchObject({ excludeFromTotal: true });
    expect(result.items[3]?.amount).toBeCloseTo(159.2, 2);
  });

  it("limits subsequent payouts to four years", () => {
    expect(cppBytexSubsequentPayoutYears()).toBe(4);
  });
});
