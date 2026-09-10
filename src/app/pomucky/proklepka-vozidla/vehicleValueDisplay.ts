export type MileageScenario = { km: number; price: number; highlighted: boolean };

// Scenarios are anchored to the same price and mileage as the main estimate.
// They illustrate mileage sensitivity; they are not observed market offers.
export function buildMileageScenarios(price: number, mileage: number): MileageScenario[] {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(mileage) || mileage < 0) return [];
  const distances = [...new Set([-60_000, -30_000, 0, 30_000, 60_000].map(offset => Math.max(0, mileage + offset)))];
  return distances.map(km => ({
    km,
    price: km === mileage ? price : Math.max(1000, Math.round(price * Math.max(.2, 1 - ((km - mileage) / Math.max(40_000, mileage)) * .55) / 1000) * 1000),
    highlighted: km === mileage,
  }));
}

export function vehiclePriceScale(estimate: number, low: number, high: number, marketMin?: number | null, marketMax?: number | null) {
  const values = [estimate, low, high, marketMin, marketMax].filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
  const min = Math.max(0, Math.floor(Math.min(...values) * .8 / 1000) * 1000);
  const max = Math.max(min + 1000, Math.ceil(Math.max(...values) * 1.15 / 1000) * 1000);
  const percent = (value: number) => Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
  return { min, max, estimate: percent(estimate), low: percent(Math.min(low, high)), high: percent(Math.max(low, high)) };
}
