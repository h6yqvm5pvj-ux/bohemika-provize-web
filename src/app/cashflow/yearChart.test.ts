import { describe, expect, it } from "vitest";
import { buildYearChart, buildYearMonthSlots, cashflowMonthPercentageChange, includeCurrentYear } from "./yearChart";
import type { MonthGroup, YearGroup } from "./types";

const month = (monthIndex: number, total: number): MonthGroup => ({
  key: `2026-${monthIndex + 1}`, year: 2026, monthIndex, label: `Měsíc ${monthIndex + 1}`,
  total, predictedTotal: total, totalSource: "predicted", statementPayoutTotal: null, items: [],
});
const year = (...months: MonthGroup[]): YearGroup => ({
  year: 2026, months, total: months.reduce((sum, value) => sum + value.total, 0),
});

describe("annual cashflow chart", () => {
  it("shows twelve current-year cards and preserves real totals, including zero and negative months", () => {
    const january = month(0, -1000);
    const september = month(8, 0);
    const input = year(january, september);
    const slots = buildYearMonthSlots(input, new Date(2026, 8, 5));
    expect(slots).toHaveLength(12);
    expect(slots[0].month).toBe(january);
    expect(slots[1].month).toBeNull();
    expect(slots[8].month).toBe(september);
    expect(slots.filter((slot) => slot.past)).toHaveLength(8);
    expect(slots.filter((slot) => slot.current).map((slot) => slot.monthIndex)).toEqual([8]);
    expect(input.months).toHaveLength(2);
    expect(input.total).toBe(-1000);
  });

  it("keeps other years limited to available months and updates the current year at New Year", () => {
    const input = year(month(8, 500));
    expect(buildYearMonthSlots(input, new Date(2025, 11, 31))).toHaveLength(1);
    const january = buildYearMonthSlots(input, new Date(2026, 0, 1));
    expect(january).toHaveLength(12);
    expect(january[0].current).toBe(true);
    expect(january.some((slot) => slot.past)).toBe(false);
    const historical = buildYearMonthSlots(input, new Date(2027, 0, 1));
    expect(historical).toHaveLength(1);
    expect(historical[0].past).toBe(true);
  });

  it("includes an empty current year without inventing monthly amounts or duplicating existing years", () => {
    const now = new Date(2026, 8, 5);
    const future = { ...year(), year: 2027 };
    expect(includeCurrentYear([future], now)).toEqual([{ year: 2026, total: 0, months: [] }, future]);
    const existing = [year(month(8, 500))];
    expect(includeCurrentYear(existing, now)).toBe(existing);
    const [empty] = includeCurrentYear([], now);
    expect(buildYearMonthSlots(empty, now)).toHaveLength(12);
    expect(buildYearChart(empty).months.every((value) => value === null)).toBe(true);
  });

  it("keeps all twelve calendar positions without presenting filtered months as zero income", () => {
    const september = month(8, 0);
    const december = month(11, 48000);
    const chart = buildYearChart(year(december, september));
    expect(chart.months).toHaveLength(12);
    expect(chart.months[0]).toBeNull();
    expect(chart.months[8]).toBe(september);
    expect(chart.months[11]).toBe(december);
    expect(chart.strongest).toBe(december);
  });

  it("puts negative payouts below zero on the same proportional scale", () => {
    const chart = buildYearChart(year(month(0, -25000), month(1, 50000)));
    expect(chart.position(-25000)).toBeGreaterThan(chart.zeroPosition);
    expect(chart.position(50000)).toBeLessThan(chart.zeroPosition);
    expect(chart.zeroPosition - chart.position(50000)).toBeCloseTo(2 * (chart.position(-25000) - chart.zeroPosition));
    expect(chart.ticks.some((tick) => tick.value === 0)).toBe(true);
    expect(chart.position(-25000)).toBeLessThanOrEqual(100);
    expect(chart.position(50000)).toBeGreaterThanOrEqual(0);
  });

  it("has a finite scale for empty and zero-only years", () => {
    for (const input of [year(), year(month(0, 0))]) {
      const chart = buildYearChart(input);
      expect(Number.isFinite(chart.zeroPosition)).toBe(true);
      expect(chart.ticks.every((tick) => Number.isFinite(tick.position))).toBe(true);
      expect(chart.ticks.length).toBeGreaterThan(1);
    }
  });

  it("handles a year of negative payouts and ignores invalid values without reversing the axis", () => {
    const chart = buildYearChart(year(month(0, -1000), month(1, -500), month(2, Number.NaN)));
    expect(chart.zeroPosition).toBe(0);
    expect(chart.position(-1000)).toBe(100);
    expect(chart.strongest?.monthIndex).toBe(1);
    expect(chart.months[2]).toBeNull();
  });
});

describe("cashflow month percentage change", () => {
  it.each([
    [1000, 1813, 81.3],
    [1000, 750, -25],
    [1000, 1000, 0],
    [1000, 0, -100],
    [1000, -500, -150],
    [3, 4, 33.3],
  ])("compares displayed amounts from %s to %s as %s percent", (previous, current, expected) => {
    expect(cashflowMonthPercentageChange(month(1, current), month(0, previous))).toBe(expected);
  });

  it("uses actual totals independently of payout and prediction metadata", () => {
    const previous = { ...month(7, 1000), predictedTotal: 2000, totalSource: "paid" as const, statementPayoutTotal: 800 };
    const current = { ...month(8, 1350), predictedTotal: 1450, totalSource: "paid" as const, statementPayoutTotal: 1000 };
    expect(cashflowMonthPercentageChange(current, previous)).toBe(35);
    expect(cashflowMonthPercentageChange({ ...current, totalSource: "predicted" }, previous)).toBe(35);
  });

  it("requires an immediately preceding calendar month, including December of the previous year", () => {
    const january = month(0, 1500);
    const december = { ...month(11, 1000), key: "2025-12", year: 2025 };
    expect(cashflowMonthPercentageChange(january, december)).toBe(50);
    expect(cashflowMonthPercentageChange(january, month(11, 1000))).toBeNull();
    expect(cashflowMonthPercentageChange(month(2, 1500), month(0, 1000))).toBeNull();
    expect(cashflowMonthPercentageChange(month(1, 1500), month(1, 1000))).toBeNull();
    expect(cashflowMonthPercentageChange(month(0, 1500), month(1, 1000))).toBeNull();
  });

  it("omits missing, non-positive or non-finite comparison bases and invalid current amounts", () => {
    const current = month(1, 1500);
    for (const previous of [null, undefined, month(0, 0), month(0, -100), month(0, NaN), month(0, Infinity)]) {
      expect(cashflowMonthPercentageChange(current, previous)).toBeNull();
    }
    for (const invalid of [null, undefined, month(1, NaN), month(1, Infinity)]) {
      expect(cashflowMonthPercentageChange(invalid, month(0, 1000))).toBeNull();
    }
    expect(cashflowMonthPercentageChange(month(1, 0), month(0, 0))).toBeNull();
    expect(cashflowMonthPercentageChange(month(1, Number.MAX_VALUE), month(0, Number.MIN_VALUE))).toBeNull();
  });

  it("normalizes a decrease rounded to zero so it cannot produce a negative zero badge", () => {
    const percentage = cashflowMonthPercentageChange(month(1, 999.99), month(0, 1000));
    expect(percentage).toBe(0);
    expect(Object.is(percentage, -0)).toBe(false);
  });
});
