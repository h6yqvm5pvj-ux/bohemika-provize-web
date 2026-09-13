/** Czech 2026 planning model, matching the MPSV 2026 sickness/pay-replacement workbooks.
 * https://mpsv.gov.cz/kalkulacka-pro-vypocet-davek-v-roce-2026
 * https://mpsv.gov.cz/kalkulacka-pro-vypocet-vyse-nahrady-mzdy-v-roce-2026
 * Monthly assessment base assumes a full 365-day reference period without excluded days.
 */
export const SICKNESS_YEAR = 2026;
export type SicknessInputs = {
  grossMonthly: string;
  hourlyEarnings: string;
  workingDays: string;
  hoursPerDay: string;
  selfEmployedMonthlyBase: string;
};
export const DEFAULT_SICKNESS_INPUTS: SicknessInputs = {
  grossMonthly: "", hourlyEarnings: "", workingDays: "10", hoursPerDay: "8", selfEmployedMonthlyBase: "",
};
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const up = (value: number) => Math.max(0, Math.ceil(value - 1e-9));
const amount = (value: string): number | null => {
  if (!value.trim()) return null;
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function reduceAssessmentBase(value: number, limits: readonly [number, number, number]): number {
  const [first, second, third] = limits;
  return cents(cents(Math.min(value, first) * .9)
    + cents(Math.max(0, Math.min(value, second) - first) * .6)
    + cents(Math.max(0, Math.min(value, third) - second) * .3));
}
export function calculateSicknessBenefits(inputs: SicknessInputs, employment: "employee" | "selfEmployed", insured: boolean) {
  const employee = employment === "employee";
  const monthlyBase = amount(employee ? inputs.grossMonthly : inputs.selfEmployedMonthlyBase);
  const hourlyEarnings = amount(inputs.hourlyEarnings);
  const days = amount(inputs.workingDays), hours = amount(inputs.hoursPerDay);
  const workingDays = days !== null && Number.isInteger(days) && days <= 14 ? days : null;
  const hoursPerDay = hours !== null && hours > 0 && hours <= 24 ? hours : null;
  const paidHours = workingDays !== null && hoursPerDay !== null ? workingDays * hoursPerDay : null;
  const dailyBase = insured ? (monthlyBase !== null && monthlyBase > 0 ? cents(monthlyBase * 12 / 365) : null) : 0;
  const reducedDailyBase = dailyBase === null ? null : up(reduceAssessmentBase(dailyBase, [1633, 2449, 4897]));
  const hourlyBenefit = employee && hourlyEarnings !== null && hourlyEarnings > 0
    ? cents(reduceAssessmentBase(hourlyEarnings, [285.78, 428.58, 856.98]) * .6) : null;
  const employerTotal = employee
    ? (hourlyBenefit !== null && paidHours !== null ? up(hourlyBenefit * paidHours) : null) : 0;
  const phases = ([.6, .66, .72] as const).map((rate, index) => {
    const daily = reducedDailyBase === null ? null : up(reducedDailyBase * rate);
    return { rate, days: index === 0 ? 16 : 30, daily, total: daily === null ? null : daily * (index === 0 ? 16 : 30) };
  });
  const cumulative = phases.map((_, index) => {
    const totals = [employerTotal, ...phases.slice(0, index + 1).map(phase => phase.total)];
    return totals.every(total => total !== null) ? totals.reduce<number>((sum, total) => sum + (total ?? 0), 0) : null;
  });
  return { year: SICKNESS_YEAR, employee, insured, monthlyBase, hourlyEarnings, workingDays, hoursPerDay,
    paidHours, dailyBase, reducedDailyBase, hourlyBenefit, employerTotal, phases, cumulative };
}
export type SicknessBenefits = ReturnType<typeof calculateSicknessBenefits>;

export function validateSicknessInputs(inputs: SicknessInputs, employee: boolean, insured: boolean): string | null {
  if (!insured) return null;
  const positive = employee ? ["grossMonthly", "hourlyEarnings"] as const : ["selfEmployedMonthlyBase"] as const;
  if (positive.some(key => inputs[key].trim() && (amount(inputs[key]) ?? 0) <= 0)) {
    return "U podkladů pro nemocenskou zadej kladnou částku, nebo nepovinné pole nech prázdné.";
  }
  if (employee) {
    const days = amount(inputs.workingDays), hours = amount(inputs.hoursPerDay);
    if (days === null || !Number.isInteger(days) || days > 14 || hours === null || hours <= 0 || hours > 24) {
      return "Pro prvních 14 dní zadej 0–14 celých pracovních dnů a více než 0, nejvýše 24 hodin za den.";
    }
  }
  return null;
}
