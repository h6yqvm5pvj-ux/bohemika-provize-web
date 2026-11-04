import { describe, expect, it } from "vitest";
import { commissionPeriodAfterMonths, commissionPeriodForCode } from "./commissionPeriodForCode";

describe("commission entitlement periods", () => {
  it("keeps Czech calendar days and clamps anniversary days", () => {
    expect(commissionPeriodAfterMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(commissionPeriodAfterMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(commissionPeriodAfterMonths(new Date("2025-12-31T23:00:00Z"), 12)).toBe("2027-01-01");
    expect(commissionPeriodAfterMonths("2026-02-30", 12)).toBeNull();
    expect(commissionPeriodAfterMonths("2026-01-01", -1)).toBeNull();
  });
  it.each([
    ["A101", 0], ["APZ101", 0], ["B0301", 0], ["B3601_HALF", 0],
    ["B3601", 36], ["B48", 48], ["B101", 12], ["B104", 48],
    ["B201", 48], ["B206", 108],
  ])("maps NEON %s to its original entitlement period", (code, months) => {
    expect(commissionPeriodForCode({ productKey: "neon", policyStartDate: "2020-01-01" }, code))
      .toBe(commissionPeriodAfterMonths("2020-01-01", months));
  });
  it("respects the later FLEXI and MaxEfekt subsequent schedules", () => {
    expect(commissionPeriodForCode({ productKey: "flexi", policyStartDate: "2020-01-01" }, "B101")).toBe("2026-01-01");
    expect(commissionPeriodForCode({ productKey: "maximaMaxEfekt", policyStartDate: "2020-01-01" }, "B101")).toBe("2025-01-01");
  });
  it("resolves payment-based initial and subsequent installments", () => {
    const entry = { productKey: "cppAuto" as const, frequencyRaw: "semiannual", policyStartDate: "2020-01-31" };
    expect(commissionPeriodForCode(entry, "A102")).toBe("2020-07-31");
    expect(commissionPeriodForCode(entry, "B101")).toBe("2021-01-31");
    expect(commissionPeriodForCode(entry, "B102")).toBe("2021-07-31");
    expect(commissionPeriodForCode({ ...entry, productKey: "cppPPRbez" }, "A102")).toBe("2020-07-31");
    expect(commissionPeriodForCode({ ...entry, productKey: "allianzAuto" }, "B102")).toBe("2022-01-31");
    expect(commissionPeriodForCode({ ...entry, productKey: "uniqaAuto" }, "B102")).toBe("2022-01-31");
    expect(commissionPeriodForCode({ ...entry, productKey: "uniqaflotila" }, "B102")).toBe("2022-01-31");
    expect(commissionPeriodForCode({ ...entry, productKey: "pillowmajetek" }, "B102")).toBe("2022-01-31");
  });
  it.each(["annual", "semiannual", "quarterly", "monthly"])("resolves C and B to the same entitlement period for Kooperativa Auto (%s)", frequencyRaw => {
    const entry = { productKey: "kooperativaAuto" as const, frequencyRaw, policyStartDate: "2020-05-03" };
    expect(commissionPeriodForCode(entry, "C102")).toBe(commissionPeriodForCode(entry, "B102"));
    expect(commissionPeriodForCode(entry, "C103")).toBe(commissionPeriodForCode(entry, "B103"));
    expect(commissionPeriodForCode(entry, "C102")).not.toBeNull();
  });
  it("requires the supported product and schedule for C entitlement periods", () => {
    expect(commissionPeriodForCode({ productKey: "cppAuto", frequencyRaw: "annual", policyStartDate: "2020-05-03" }, "C102")).toBeNull();
    expect(commissionPeriodForCode({ productKey: "kooperativaAuto", policyStartDate: "2020-05-03" }, "C102")).toBeNull();
  });
  it.each(["B101-B104", "B105", "A201", "NV101", "unknown", "B3601_HALF_OTHER"])("keeps ambiguous or unrelated NEON %s unadjusted", code => {
    expect(commissionPeriodForCode({ productKey: "neon", policyStartDate: "2020-01-01" }, code)).toBeNull();
  });
  it("requires start date and payment frequency instead of guessing from payout dates", () => {
    expect(commissionPeriodForCode({ productKey: "neon" }, "B101")).toBeNull();
    expect(commissionPeriodForCode({ productKey: "cppAuto", policyStartDate: "2020-01-01" }, "A102")).toBeNull();
    expect(commissionPeriodForCode({ productKey: "conseqzenit", policyStartDate: "2020-01-01" }, "A101")).toBeNull();
  });
});
