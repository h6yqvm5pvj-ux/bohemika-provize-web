import { describe, expect, it } from "vitest";
import { OUNCE_G, convertGoldAmount, goldHistoryCsv, normalizeGoldPoints, parseGoldAmount, summarizeGoldPoints } from "./goldModel";

describe("gold converter", () => {
  it("accepts Czech decimals and spaces, including zero", () => {
    expect(parseGoldAmount(" 50 000,50 ")).toBe(50000.5);
    expect(parseGoldAmount("0")).toBe(0);
    for (const input of ["", "-10", "1,2,3", "10abc", "Infinity", "1e3"]) expect(parseGoldAmount(input)).toBeNull();
  });
  it("converts a troy ounce and fractional grams without rounding the underlying price", () => {
    expect(convertGoldAmount(OUNCE_G, 90000, "grams")?.czk).toBeCloseTo(90000);
    expect(convertGoldAmount(0.5, OUNCE_G * 3000, "grams")?.czk).toBeCloseTo(1500);
  });
  it("converts a budget back to grams and handles zero", () => {
    expect(convertGoldAmount(90000, 90000, "budget")?.grams).toBeCloseTo(OUNCE_G);
    expect(convertGoldAmount(0, 90000, "budget")).toEqual({ grams: 0, czk: 0 });
    expect(convertGoldAmount(0, 90000, "grams")).toEqual({ grams: 0, czk: 0 });
  });
  it("does not invent a result when the input or price is unavailable or invalid", () => {
    for (const price of [null, 0, -1, Infinity, NaN]) expect(convertGoldAmount(10, price, "grams")).toBeNull();
    for (const amount of [null, -1, Infinity, NaN, Number.MAX_VALUE]) expect(convertGoldAmount(amount, 90000, "grams")).toBeNull();
  });
});

describe("gold history", () => {
  const points = [{ t: Date.UTC(2026, 0, 1), v: 100 }, { t: Date.UTC(2026, 0, 2), v: 140 }, { t: Date.UTC(2026, 0, 3), v: 120 }];
  it("keeps the first price in period extrema and percentage change", () => {
    const summary = summarizeGoldPoints(points)!;
    expect(summary.min).toEqual(points[0]);
    expect(summary.max).toEqual(points[1]);
    expect(summary.change).toBeCloseTo(20);
    expect(summarizeGoldPoints([points[0]])?.change).toBe(0);
    expect(summarizeGoldPoints([])).toBeNull();
  });
  it("sorts samples, takes the latest duplicate and filters invalid values", () => {
    expect(normalizeGoldPoints([points[2], points[0], { ...points[1], v: 130 }, points[1], { t: NaN, v: 10 }, { t: 0, v: -10 }, { t: 1e20, v: 10 }])).toEqual(points);
  });
  it("exports every available sample with explicit UTC and Czech decimal values", () => {
    const csv = goldHistoryCsv([...points].reverse(), "1 oz");
    expect(csv).toBe("\uFEFFDatum (UTC);Cena v Kč / 1 oz\r\n2026-01-01T00:00:00.000Z;100,00\r\n2026-01-02T00:00:00.000Z;140,00\r\n2026-01-03T00:00:00.000Z;120,00");
  });
});
