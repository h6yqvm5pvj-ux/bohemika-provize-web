export const PAYMENT_FREQUENCIES = [
  { id: "monthly", label: "Měsíční", months: 1 },
  { id: "quarterly", label: "Čtvrtletní", months: 3 },
  { id: "semiannual", label: "Pololetní", months: 6 },
  { id: "annual", label: "Roční", months: 12 },
] as const;

export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number]["id"];

export type ReplacementCalculationInput = {
  originalStartDate: string;
  replacementStartDate: string;
  originalPremium: number;
  originalFrequency: PaymentFrequency;
  replacementPremium: number;
  replacementFrequency: PaymentFrequency;
};

export type ReplacementCalculation = {
  ok: true;
  originalEndDate: string;
  paidPeriodStartDate: string;
  paidPeriodEndDate: string;
  nominalElapsedDays: number;
  nominalPeriodDays: number;
  unusedShare: number;
  transferredPremiumRaw: number;
  transferredPremium: number;
  replacementPremium: number;
  balance: number;
  balanceType: "surcharge" | "overpayment" | "settled";
};

export type ReplacementCalculationError = {
  ok: false;
  error: "invalid-date" | "invalid-premium" | "replacement-before-original";
};

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const frequencyMonths = (frequency: PaymentFrequency): number =>
  PAYMENT_FREQUENCIES.find((item) => item.id === frequency)?.months ?? 12;

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const parseIsoDate = (value: string): CalendarDate | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }

  return { year, month, day };
};

const toSerialDay = (date: CalendarDate): number =>
  Math.round(Date.UTC(date.year, date.month - 1, date.day) / DAY_MS);

const toIsoDate = (date: CalendarDate): string =>
  `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(
    date.day
  ).padStart(2, "0")}`;

const addDays = (date: CalendarDate, days: number): CalendarDate => {
  const next = new Date((toSerialDay(date) + days) * DAY_MS);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
};

const addAnchoredMonths = (
  anchor: CalendarDate,
  monthsToAdd: number
): CalendarDate => {
  const monthIndex = anchor.month - 1 + monthsToAdd;
  const year = anchor.year + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  return {
    year,
    month,
    day: Math.min(anchor.day, daysInMonth(year, month)),
  };
};

const completedInsuranceMonths = (
  originalStart: CalendarDate,
  replacementStart: CalendarDate
): number => {
  let months =
    (replacementStart.year - originalStart.year) * 12 +
    replacementStart.month -
    originalStart.month;
  months = Math.max(0, months);

  while (
    months > 0 &&
    toSerialDay(addAnchoredMonths(originalStart, months)) >
      toSerialDay(replacementStart)
  ) {
    months -= 1;
  }
  while (
    toSerialDay(addAnchoredMonths(originalStart, months + 1)) <=
    toSerialDay(replacementStart)
  ) {
    months += 1;
  }

  return months;
};

export const calculateReplacement = (
  input: ReplacementCalculationInput
): ReplacementCalculation | ReplacementCalculationError => {
  const originalStart = parseIsoDate(input.originalStartDate);
  const replacementStart = parseIsoDate(input.replacementStartDate);
  if (!originalStart || !replacementStart) {
    return { ok: false, error: "invalid-date" };
  }
  if (
    !Number.isFinite(input.originalPremium) ||
    input.originalPremium <= 0 ||
    !Number.isFinite(input.replacementPremium) ||
    input.replacementPremium <= 0
  ) {
    return { ok: false, error: "invalid-premium" };
  }
  if (toSerialDay(replacementStart) < toSerialDay(originalStart)) {
    return { ok: false, error: "replacement-before-original" };
  }

  const periodMonths = frequencyMonths(input.originalFrequency);
  const completedMonths = completedInsuranceMonths(originalStart, replacementStart);
  const completedMonthDate = addAnchoredMonths(originalStart, completedMonths);
  const isExactPaymentBoundary =
    completedMonths > 0 &&
    completedMonths % periodMonths === 0 &&
    toSerialDay(completedMonthDate) === toSerialDay(replacementStart);

  const periodStartMonth = isExactPaymentBoundary
    ? completedMonths - periodMonths
    : Math.floor(completedMonths / periodMonths) * periodMonths;
  const elapsedWholeMonths = completedMonths - periodStartMonth;
  const partialCalendarDays = isExactPaymentBoundary
    ? 0
    : Math.max(0, toSerialDay(replacementStart) - toSerialDay(completedMonthDate));
  const nominalPeriodDays = periodMonths * 30;
  const nominalElapsedDays = Math.min(
    nominalPeriodDays,
    elapsedWholeMonths * 30 + Math.min(30, partialCalendarDays)
  );
  const unusedShare = Math.max(
    0,
    Math.min(1, (nominalPeriodDays - nominalElapsedDays) / nominalPeriodDays)
  );
  const transferredPremiumRaw = input.originalPremium * unusedShare;
  const transferredPremium = Math.round(transferredPremiumRaw);
  const replacementPremium = Math.round(input.replacementPremium);
  const balance = Math.round(replacementPremium - transferredPremium);
  const paidPeriodStart = addAnchoredMonths(originalStart, periodStartMonth);
  const paidPeriodEnd = addDays(
    addAnchoredMonths(originalStart, periodStartMonth + periodMonths),
    -1
  );

  return {
    ok: true,
    originalEndDate: toIsoDate(addDays(replacementStart, -1)),
    paidPeriodStartDate: toIsoDate(paidPeriodStart),
    paidPeriodEndDate: toIsoDate(paidPeriodEnd),
    nominalElapsedDays,
    nominalPeriodDays,
    unusedShare,
    transferredPremiumRaw,
    transferredPremium,
    replacementPremium,
    balance,
    balanceType:
      balance > 0 ? "surcharge" : balance < 0 ? "overpayment" : "settled",
  };
};
