import { describe, expect, it } from "vitest";
import {
  buildCashflowLineSegments,
  CASHFLOW_PLOT_HEIGHT,
  CASHFLOW_PLOT_WIDTH,
} from "./cashflowLineGraph";
import type { MonthGroup } from "./types";
import { buildYearChart } from "./yearChart";

const month = (monthIndex: number, total: number): MonthGroup => ({
  key: `2026-${monthIndex + 1}`, year: 2026, monthIndex, label: `Měsíc ${monthIndex + 1}`,
  total, predictedTotal: total, totalSource: "predicted", statementPayoutTotal: null, items: [],
});
const chartFor = (...months: MonthGroup[]) => buildYearChart({
  year: 2026, total: months.reduce((sum, value) => sum + value.total, 0), months,
});

describe("cashflow line graph geometry", () => {
  it("preserves twelve fixed calendar positions without collapsing missing months", () => {
    const months = Array.from({ length: 12 }, (_, index) => month(index, 100));
    const [segment] = buildCashflowLineSegments(months, () => 50, 100);
    expect(segment.points).toHaveLength(12);
    expect(segment.points.map(point => point.monthIndex)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(segment.points.map(point => point.x)).toEqual(Array.from({ length: 12 }, (_, i) => 50 + i * 100));
    expect(segment.points[11].x).toBeLessThan(CASHFLOW_PLOT_WIDTH);

    const sparse = chartFor(month(0, 100), month(11, 200));
    const segments = buildCashflowLineSegments(sparse.months, sparse.position, sparse.zeroPosition);
    expect(segments.map(value => value.points[0].x)).toEqual([50, 1150]);
  });

  it("splits the line and area at missing or invalid months instead of inventing zero income", () => {
    const input = [month(0, 10), month(1, 20), null, month(3, 30), month(4, NaN),
      month(5, Infinity), month(6, 0), month(7, -Infinity), month(8, 40)];
    const segments = buildCashflowLineSegments(input, value => 50 - value, 50);
    expect(segments.map(segment => segment.points.map(point => point.monthIndex))).toEqual([[0, 1], [3], [6], [8]]);
    expect(segments.every(segment => !/NaN|Infinity/.test(segment.linePath + segment.fillPath))).toBe(true);
    expect(segments[0].fillPath).toMatch(/ L 150 110 L 50 110 Z$/);
    expect(segments[1].fillPath).toMatch(/ L 350 110 L 350 110 Z$/);
  });

  it("uses the shared linear scale for positive, zero and negative cashflow", () => {
    const chart = chartFor(month(0, -25000), month(1, 0), month(2, 50000));
    const [segment] = buildCashflowLineSegments(chart.months, chart.position, chart.zeroPosition);
    const [negative, zero, positive] = segment.points;
    const zeroY = chart.zeroPosition / 100 * CASHFLOW_PLOT_HEIGHT;
    expect(zero.y).toBe(zeroY);
    expect(negative.y).toBeGreaterThan(zero.y);
    expect(positive.y).toBeLessThan(zero.y);
    expect(zero.y - positive.y).toBeCloseTo(2 * (negative.y - zero.y));
    expect(segment.fillPath).toContain(`L ${positive.x} ${zeroY} L ${negative.x} ${zeroY} Z`);
  });

  it("retains actual zero points and finite paths for zero-only and negative-only years", () => {
    for (const chart of [chartFor(month(0, 0), month(1, 0)), chartFor(month(0, -1000), month(1, -500))]) {
      const [segment] = buildCashflowLineSegments(chart.months, chart.position, chart.zeroPosition);
      expect(segment.points).toHaveLength(2);
      expect(segment.points.every(point => Number.isFinite(point.y))).toBe(true);
      expect(segment.linePath + segment.fillPath).not.toMatch(/NaN|Infinity/);
    }
    const chart = chartFor(month(0, 0), month(1, 0));
    const [zeros] = buildCashflowLineSegments(chart.months, chart.position, chart.zeroPosition);
    expect(zeros.points[0].y).toBe(zeros.points[1].y);
  });

  it("keeps a singleton as a point and move command with a closed degenerate area", () => {
    const [segment] = buildCashflowLineSegments([null, month(1, 0)], () => 50, 50);
    expect(segment.points).toEqual([{ monthIndex: 1, x: 150, y: 110 }]);
    expect(segment.linePath).toBe("M 150 110");
    expect(segment.fillPath).toBe("M 150 110 L 150 110 L 150 110 Z");
  });

  it("never draws curves outside their endpoint values or reverses their horizontal direction", () => {
    const input = [month(0, 40), month(1, -20), month(2, 15), month(3, 15), month(4, -30)];
    const [segment] = buildCashflowLineSegments(input, value => 50 - value, 50);
    const curves = [...segment.linePath.matchAll(/C ([^C]+)/g)].map(match => match[1].trim().split(/\s+/).map(Number));
    expect(curves).toHaveLength(input.length - 1);
    curves.forEach(([cx1, cy1, cx2, cy2, x, y], index) => {
      const start = segment.points[index];
      const end = segment.points[index + 1];
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      expect(cx1).toBeGreaterThan(start.x);
      expect(cx2).toBeGreaterThanOrEqual(cx1);
      expect(cx2).toBeLessThan(end.x);
      expect(x).toBe(end.x);
      expect(y).toBe(end.y);
      for (const controlY of [cy1, cy2]) {
        expect(controlY).toBeGreaterThanOrEqual(minY);
        expect(controlY).toBeLessThanOrEqual(maxY);
      }
    });
  });

  it("uses only the existing month total and leaves source metadata and inputs untouched", () => {
    const paid = { ...month(0, 1350), predictedTotal: 1450, statementPayoutTotal: 1000, totalSource: "paid" as const };
    const input = [paid];
    const before = structuredClone(input);
    const positions: number[] = [];
    const actual = buildCashflowLineSegments(input, value => { positions.push(value); return 25; }, 100);
    const predicted = buildCashflowLineSegments([{ ...paid, totalSource: "predicted" }], () => 25, 100);
    expect(positions).toEqual([1350]);
    expect(actual).toEqual(predicted);
    expect(input).toEqual(before);
  });

  it("returns no geometry for empty data or invalid baseline and breaks at invalid projected values", () => {
    expect(buildCashflowLineSegments([], () => 50, 50)).toEqual([]);
    expect(buildCashflowLineSegments([month(0, 1)], () => 50, NaN)).toEqual([]);
    expect(buildCashflowLineSegments([month(0, 1)], () => 50, Infinity)).toEqual([]);
    const segments = buildCashflowLineSegments([month(0, 1), month(1, 2), month(2, 3)], value => value === 2 ? Infinity : 50, 50);
    expect(segments.map(segment => segment.points.map(point => point.monthIndex))).toEqual([[0], [2]]);
  });
});
