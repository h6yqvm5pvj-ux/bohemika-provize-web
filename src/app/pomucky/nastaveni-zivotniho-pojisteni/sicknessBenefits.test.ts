import { describe, expect, it } from "vitest";
import { calculateSicknessBenefits, DEFAULT_SICKNESS_INPUTS, reduceAssessmentBase, validateSicknessInputs } from "./sicknessBenefits";

describe("Czech sickness benefits 2026", () => {
  it("matches the user's example: 35,000 Kč gross, 180 Kč/hour, ten eight-hour workdays", () => {
    const result = calculateSicknessBenefits({ ...DEFAULT_SICKNESS_INPUTS, grossMonthly: "35000", hourlyEarnings: "180" }, "employee", true);
    expect(result.employerTotal).toBe(7776);
    expect(result.phases.map(p => p.total)).toEqual([9952,20520,22380]);
    expect(result.cumulative[0]).toBe(17728);
  });
  it("matches the published MPSV workbook example: monthly 50,000 Kč, 90 days", () => {
    const result = calculateSicknessBenefits({ ...DEFAULT_SICKNESS_INPUTS, grossMonthly: "50 000" }, "employee", true);
    expect(result.dailyBase).toBe(1643.84);
    expect(result.reducedDailyBase).toBe(1477);
    expect(result.phases.map(p => p.daily)).toEqual([887, 975, 1064]);
    expect(result.phases.map(p => p.total)).toEqual([14192, 29250, 31920]);
    expect(result.phases.reduce((sum, p) => sum + p.total!, 0)).toBe(75362);
  });
  it("matches MPSV employer workbook: 500 Kč/h, 40 hours, rounds individual bands and hourly compensation", () => {
    const result = calculateSicknessBenefits({ ...DEFAULT_SICKNESS_INPUTS, hourlyEarnings: "500", workingDays: "5" }, "employee", true);
    expect(result.hourlyBenefit).toBe(218.59);
    expect(result.paidHours).toBe(40);
    expect(result.employerTotal).toBe(8744);
  });
  it("pays 10 working days, then 16 / 30 / 30 calendar days and adds both payers", () => {
    const result = calculateSicknessBenefits({ ...DEFAULT_SICKNESS_INPUTS, grossMonthly: "50000", hourlyEarnings: "500" }, "employee", true);
    expect(result.employerTotal).toBe(17488);
    expect(result.phases.map(p => p.days)).toEqual([16,30,30]);
    expect(result.cumulative).toEqual([31680, 60930, 92850]);
  });
  it("supports part-time shifts and zero scheduled working days", () => {
    const inputs = { ...DEFAULT_SICKNESS_INPUTS, hourlyEarnings: "200,50", hoursPerDay: "4" };
    expect(calculateSicknessBenefits(inputs, "employee", true).employerTotal).toBe(4331);
    expect(calculateSicknessBenefits({ ...inputs, workingDays: "0" }, "employee", true).employerTotal).toBe(0);
  });
  it("applies each reduction band and caps income over the third threshold", () => {
    expect(reduceAssessmentBase(1633, [1633,2449,4897])).toBe(1469.7);
    expect(reduceAssessmentBase(2449, [1633,2449,4897])).toBe(1959.3);
    expect(reduceAssessmentBase(4897, [1633,2449,4897])).toBe(2693.7);
    expect(reduceAssessmentBase(10000, [1633,2449,4897])).toBe(2693.7);
  });
  it("keeps missing amounts distinct from zero and never borrows net income", () => {
    const result = calculateSicknessBenefits(DEFAULT_SICKNESS_INPUTS, "employee", true);
    expect(result.employerTotal).toBeNull();
    expect(result.phases[0].daily).toBeNull();
    expect(result.cumulative).toEqual([null,null,null]);
    expect(calculateSicknessBenefits({ ...DEFAULT_SICKNESS_INPUTS, hourlyEarnings: "NaN" }, "employee", true).employerTotal).toBeNull();
  });
  it("uses the OSVČ sickness-insurance base and excludes employer compensation", () => {
    const result = calculateSicknessBenefits({ ...DEFAULT_SICKNESS_INPUTS, grossMonthly: "50000", selfEmployedMonthlyBase: "9000", hourlyEarnings: "500" }, "selfEmployed", true);
    expect(result.monthlyBase).toBe(9000);
    expect(result.employerTotal).toBe(0);
    expect(result.phases.map(p => p.daily)).toEqual([161,177,193]);
    expect(result.cumulative).toEqual([2576,7886,13676]);
  });
  it("uninsured OSVČ gets zero OSSZ even if old input values remain", () => {
    const result = calculateSicknessBenefits({ ...DEFAULT_SICKNESS_INPUTS, selfEmployedMonthlyBase: "9000" }, "selfEmployed", false);
    expect(result.cumulative).toEqual([0,0,0]);
  });
  it("validates optional data and rejects invalid working schedules", () => {
    expect(validateSicknessInputs(DEFAULT_SICKNESS_INPUTS, true, true)).toBeNull();
    for (const grossMonthly of ["0", "-1", "Infinity", "1e999", "abc"]) expect(validateSicknessInputs({ ...DEFAULT_SICKNESS_INPUTS, grossMonthly }, true, true)).not.toBeNull();
    for (const workingDays of ["15", "1.5", "", "-1"]) expect(validateSicknessInputs({ ...DEFAULT_SICKNESS_INPUTS, workingDays }, true, true)).not.toBeNull();
    expect(validateSicknessInputs({ ...DEFAULT_SICKNESS_INPUTS, hoursPerDay: "25" }, true, true)).not.toBeNull();
    expect(validateSicknessInputs({ ...DEFAULT_SICKNESS_INPUTS, workingDays: "999" }, false, false)).toBeNull();
  });
});
