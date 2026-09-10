import { describe, expect, it } from "vitest";
import { buildMileageScenarios, vehiclePriceScale } from "./vehicleValueDisplay";

describe("vehicle value display", () => {
  it("keeps the current mileage at the main estimate, including cars worth less than 60000 CZK", () => {
    const rows = buildMileageScenarios(45_000, 193_787);
    expect(rows.find(row => row.highlighted)).toEqual({ km: 193_787, price: 45_000, highlighted: true });
    expect(rows.at(-1)!.price).toBeLessThan(45_000);
    expect(rows[0].price).toBeGreaterThan(45_000);
    expect(rows.every((row, i) => !i || row.price <= rows[i - 1].price)).toBe(true);
  });
  it("avoids duplicate or negative mileages on newer cars and keeps only one current scenario", () => {
    const rows = buildMileageScenarios(420_000, 10_000);
    expect(rows.every(row => row.km >= 0)).toBe(true);
    expect(new Set(rows.map(row => row.km)).size).toBe(rows.length);
    expect(rows.filter(row => row.highlighted)).toHaveLength(1);
  });
  it("contains the actual range and estimate even when an old market minimum is above the vehicle price", () => {
    const scale = vehiclePriceScale(45_000, 40_000, 50_000, 50_000, 63_000);
    expect(scale.min).toBeLessThan(40_000);
    expect(scale.low).toBeLessThan(scale.estimate);
    expect(scale.estimate).toBeLessThan(scale.high);
    expect(scale.high).toBeLessThan(100);
  });
});
