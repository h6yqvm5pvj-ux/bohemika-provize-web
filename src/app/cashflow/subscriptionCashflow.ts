export const SUBSCRIPTION_CASHFLOW_OWNER_EMAIL = "jakub.rauscher@bohemika.eu";

export type CashflowSubscriptionPlan = "monthly" | "semiannual" | "yearly";

export const CASHFLOW_SUBSCRIPTION_PLANS = [
  "monthly",
  "semiannual",
  "yearly",
] as const satisfies readonly CashflowSubscriptionPlan[];

export const CASHFLOW_SUBSCRIPTION_PLAN_LABELS: Record<
  CashflowSubscriptionPlan,
  string
> = {
  monthly: "Měsíční",
  semiannual: "Pololetní",
  yearly: "Roční",
};

export const CASHFLOW_SUBSCRIPTION_INTERVAL_MONTHS: Record<
  CashflowSubscriptionPlan,
  number
> = {
  monthly: 3,
  semiannual: 6,
  yearly: 12,
};

export const normalizeCashflowEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const isSubscriptionCashflowOwner = (value: unknown): boolean =>
  normalizeCashflowEmail(value) === SUBSCRIPTION_CASHFLOW_OWNER_EMAIL;

export const isCashflowSubscriptionPlan = (
  value: unknown
): value is CashflowSubscriptionPlan =>
  CASHFLOW_SUBSCRIPTION_PLANS.includes(value as CashflowSubscriptionPlan);

export const subscriptionPlanLabel = (
  plan: CashflowSubscriptionPlan | string | null | undefined
): string => {
  if (isCashflowSubscriptionPlan(plan)) {
    return CASHFLOW_SUBSCRIPTION_PLAN_LABELS[plan];
  }
  return "Předplatné";
};

export const subscriptionIntervalMonths = (
  plan: CashflowSubscriptionPlan
): number => CASHFLOW_SUBSCRIPTION_INTERVAL_MONTHS[plan];

export const parseSubscriptionIsoDay = (
  value: string | null | undefined
): Date | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

export const formatSubscriptionIsoDay = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const addSubscriptionMonths = (date: Date, months: number): Date => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const endOfTargetMonth = new Date(year, month + months + 1, 0).getDate();
  return new Date(year, month + months, Math.min(day, endOfTargetMonth));
};

export const subscriptionPeriodUntilIso = (
  periodFrom: Date,
  plan: CashflowSubscriptionPlan
): string => {
  const nextPeriodStart = addSubscriptionMonths(
    periodFrom,
    subscriptionIntervalMonths(plan)
  );
  const periodUntil = new Date(nextPeriodStart);
  periodUntil.setDate(periodUntil.getDate() - 1);
  return formatSubscriptionIsoDay(periodUntil);
};
