import { describe, expect, it } from "vitest";
import { EMPTY_SICKNESS_ESTIMATE, estimateSicknessIncome, type SicknessEstimateInputs } from "./sicknessEstimate";

const employee: SicknessEstimateInputs = {
  ...EMPTY_SICKNESS_ESTIMATE, grossMonthly: "35 000", hourlyEarnings: "180", netMonthly: "30000",
};

describe("public sickness income estimate", () => {
  it("separates employer and OSSZ payments and compares only with net income", () => {
    const result = estimateSicknessIncome(employee).result!;
    expect(result).toMatchObject({ employer: 7776, state: 9952, total: 17728, normalIncome: 30000, shortfall: 12272, estimatedHourly: false });
    expect(estimateSicknessIncome({ ...employee, netMonthly: "" }).result?.shortfall).toBeNull();
  });
  it("adds all periods without multiplying the first fortnight of employer compensation", () => {
    expect(estimateSicknessIncome({ ...employee, period: 60 }).result).toMatchObject({ employer: 7776, state: 30472, total: 38248, normalIncome: 60000, shortfall: 21752 });
    expect(estimateSicknessIncome({ ...employee, period: 90 }).result).toMatchObject({ employer: 7776, state: 52852, total: 60628, normalIncome: 90000, shortfall: 29372 });
  });
  it("marks an approximated hourly wage and permits an actual wage and shift schedule", () => {
    const estimated = estimateSicknessIncome({ ...employee, hourlyEarnings: "" }).result!;
    expect(estimated.estimatedHourly).toBe(true);
    expect(estimated.benefits.hourlyEarnings).toBe(201.92);
    expect(estimateSicknessIncome({ ...employee, hourlyEarnings: "500", workingDays: "5" }).result?.employer).toBe(8744);
    expect(estimateSicknessIncome({ ...employee, workingDays: "0" }).result?.employer).toBe(0);
  });
  it("uses the voluntary sickness base for insured OSVČ and gives no employer compensation", () => {
    const input = { ...employee, employment: "selfEmployed" as const, insured: true, selfEmployedMonthlyBase: "9000" };
    expect(estimateSicknessIncome(input).result).toMatchObject({ employer: 0, state: 2576, total: 2576 });
    expect(estimateSicknessIncome({ ...input, insured: false, period: 90 }).result).toMatchObject({ employer: 0, state: 0, total: 0, shortfall: 90000 });
  });
  it("does not show plausible totals for incomplete or invalid active inputs", () => {
    expect(estimateSicknessIncome(EMPTY_SICKNESS_ESTIMATE)).toMatchObject({ missing: true, result: null });
    for (const grossMonthly of ["-1", "abc", "Infinity", "1e999", "0"]) {
      expect(estimateSicknessIncome({ ...employee, grossMonthly }).errors).toContain("grossMonthly");
    }
    for (const workingDays of ["15", "1.5", "-1"]) {
      expect(estimateSicknessIncome({ ...employee, workingDays }).errors).toContain("workingDays");
    }
    expect(estimateSicknessIncome({ ...employee, hoursPerDay: "25" }).result).toBeNull();
    expect(estimateSicknessIncome({ ...employee, hourlyEarnings: "-100" }).result).toBeNull();
    expect(estimateSicknessIncome({ ...employee, netMonthly: "-1" }).result).toBeNull();
    expect(estimateSicknessIncome({ ...employee, employment: "selfEmployed", insured: false, grossMonthly: "bad", hourlyEarnings: "bad" }).result?.total).toBe(0);
  });
  it("accepts Czech decimals, keeps zero distinct from missing, and never shows a negative shortfall", () => {
    expect(estimateSicknessIncome({ ...employee, hourlyEarnings: "200,50", hoursPerDay: "4" }).result?.employer).toBe(4331);
    expect(estimateSicknessIncome({ ...employee, netMonthly: "0" }).result).toMatchObject({ normalIncome: 0, shortfall: 0 });
    expect(estimateSicknessIncome({ ...employee, netMonthly: "1000" }).result?.shortfall).toBe(0);
  });
});
