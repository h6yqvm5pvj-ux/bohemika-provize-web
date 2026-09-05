import type { MonthGroup, YearGroup } from "./types";

export const CHART_MONTH_LABELS = [
  "Led", "Úno", "Bře", "Dub", "Kvě", "Čvn",
  "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro",
] as const;

export function includeCurrentYear(years: YearGroup[], now = new Date()): YearGroup[] {
  const currentYear = now.getFullYear();
  if (years.some((year) => year.year === currentYear)) return years;
  return [...years, { year: currentYear, total: 0, months: [] }]
    .sort((a, b) => a.year - b.year);
}

export function isPastCashflowMonth(year: number, monthIndex: number, now = new Date()): boolean {
  return year < now.getFullYear() || (year === now.getFullYear() && monthIndex < now.getMonth());
}

export function buildYearMonthSlots(year: YearGroup, now = new Date()) {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const month = year.months.find((value) => value.monthIndex === monthIndex) ?? null;
    return {
      key: `${year.year}-${monthIndex + 1}`,
      monthIndex,
      label: new Date(year.year, monthIndex, 1).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }),
      month,
      past: isPastCashflowMonth(year.year, monthIndex, now),
      current: year.year === now.getFullYear() && monthIndex === now.getMonth(),
    };
  }).filter((slot) => year.year === now.getFullYear() || slot.month !== null);
}

export function buildYearChart(year: YearGroup) {
  // Missing months may have been filtered out. Keep them distinct from a real zero.
  const months: (MonthGroup | null)[] = Array.from({ length: 12 }, (_, index) =>
    year.months.find((month) => month.monthIndex === index && Number.isFinite(month.total)) ?? null
  );
  const available = months.filter((month): month is MonthGroup => month !== null);
  const min = Math.min(0, ...available.map((month) => month.total));
  const max = Math.max(0, ...available.map((month) => month.total));
  const rawStep = (max - min || 1000) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 2.5, 5, 10].find((value) => value >= rawStep / magnitude) ?? 10) * magnitude;
  const lower = Math.floor(min / step) * step;
  const upper = Math.max(Math.ceil(max / step) * step, lower + step);
  const range = upper - lower;
  const position = (value: number) => ((upper - value) / range) * 100;
  const ticks = Array.from({ length: Math.round(range / step) + 1 }, (_, i) => {
    const value = upper - i * step;
    return { value: Object.is(value, -0) ? 0 : value, position: position(value) };
  });

  return {
    months,
    ticks,
    zeroPosition: position(0),
    position,
    strongest: available.reduce<MonthGroup | null>((best, month) =>
      !best || month.total > best.total ? month : best, null),
  };
}

export function formatChartAmount(value: number): string {
  const absolute = Math.abs(value);
  const divisor = absolute >= 1_000_000 ? 1_000_000 : absolute >= 1000 ? 1000 : 1;
  const suffix = divisor === 1_000_000 ? " mil." : divisor === 1000 ? " tis." : "";
  return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value / divisor)}${suffix}`;
}
