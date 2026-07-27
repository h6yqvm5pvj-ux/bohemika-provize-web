import { describe, expect, it } from "vitest";

import { projectNeonPayouts } from "./projectionLogic";

describe("performance projection logic", () => {
  it("includes NEON immediate payouts in the first projection year", () => {
    const payouts = projectNeonPayouts(
      5000,
      "manazer8",
      "accelerated",
      new Date(2026, 0, 1),
      0
    );

    const firstYearTotal = payouts
      .filter((payout) => payout.date.getFullYear() === 2026)
      .reduce((sum, payout) => sum + payout.amount, 0);

    expect(firstYearTotal).toBeGreaterThan(0);
    expect(payouts[0]?.date).toEqual(new Date(2026, 1, 1));
  });
});
