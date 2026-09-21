import {
  calculateSicknessBenefits,
  DEFAULT_SICKNESS_INPUTS,
  type SicknessInputs,
} from "@/app/pomucky/nastaveni-zivotniho-pojisteni/sicknessBenefits";

export const SICKNESS_PERIODS = [30, 60, 90] as const;
export type SicknessPeriod = (typeof SICKNESS_PERIODS)[number];
export type SicknessEstimateInputs = SicknessInputs & {
  employment: "employee" | "selfEmployed";
  insured: boolean;
  netMonthly: string;
  period: SicknessPeriod;
};
export const EMPTY_SICKNESS_ESTIMATE: SicknessEstimateInputs = {
  ...DEFAULT_SICKNESS_INPUTS,
  employment: "employee",
  insured: false,
  netMonthly: "",
  period: 30,
};

function parseAmount(raw: string): number | null {
  const value = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number <= 100_000_000 ? number : null;
}

/** Public estimate built on the same 2026 model as the advisor's planning tool.
 * Only the optional hourly wage is approximated: a 40-hour week, 52 weeks/year.
 * Net income is supplied by the visitor, never inferred from gross salary.
 */
export function estimateSicknessIncome(input: SicknessEstimateInputs) {
  const employee = input.employment === "employee";
  const insured = employee || input.insured;
  const errors: Array<keyof SicknessEstimateInputs> = [];
  let missing = false;
  const check = (key: keyof SicknessInputs | "netMonthly", required: boolean, min: number, max = 100_000_000, integer = false) => {
    if (!input[key].trim()) {
      if (required) missing = true;
      return null;
    }
    const value = parseAmount(input[key]);
    if (value === null || value < min || value > max || (integer && !Number.isInteger(value))) errors.push(key);
    return value;
  };
  const gross = employee ? check("grossMonthly", true, 0.01) : null;
  if (!employee && insured) check("selfEmployedMonthlyBase", true, 0.01);
  if (employee) {
    check("hourlyEarnings", false, 0.01);
    check("workingDays", true, 0, 14, true);
    check("hoursPerDay", true, 0.01, 24);
  }
  const net = check("netMonthly", false, 0);
  if (errors.length || missing) return { errors, missing, result: null };

  const estimatedHourly = employee && !input.hourlyEarnings.trim();
  const hourlyEarnings = estimatedHourly && gross !== null
    ? (Math.round(gross / (40 * 52 / 12) * 100) / 100).toString()
    : input.hourlyEarnings;
  const benefits = calculateSicknessBenefits({ ...input, hourlyEarnings }, input.employment, insured);
  const periodIndex = SICKNESS_PERIODS.indexOf(input.period);
  const phases = benefits.phases.slice(0, periodIndex + 1);
  const employer = benefits.employerTotal;
  if (employer === null || phases.some(phase => phase.total === null)) return { errors, missing: true, result: null };
  const state = phases.reduce((sum, phase) => sum + (phase.total ?? 0), 0);
  const total = employer + state;
  const normalIncome = net === null ? null : Math.round(net * input.period / 30);
  return {
    errors,
    missing,
    result: {
      benefits, employer, state, total, normalIncome, estimatedHourly,
      shortfall: normalIncome === null ? null : Math.max(0, normalIncome - total),
    },
  };
}
