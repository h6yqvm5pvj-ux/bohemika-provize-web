import { describe, expect, it } from "vitest";

import { calculateCppAuto } from "./productFormulas/cppAuto";
import { applyTipContractAdjustmentToCommissionResult } from "./tipContractCommission";

describe("tip contract commission adjustment", () => {
  it("keeps only the closing adviser's share in a tipped auto result", () => {
    const calculated = calculateCppAuto(
      25_761,
      "annual",
      "manazer8",
      "2026-06-12"
    );
    const adjusted = applyTipContractAdjustmentToCommissionResult({
      product: "cppAuto",
      tipsterPercent: 80,
      total: calculated.total,
      items: calculated.items,
    });

    expect(adjusted.total).toBe(659.48);
    expect(adjusted.items).toEqual([
      { code: "A101", title: "🚗 Okamžitá provize", amount: 659.48 },
      {
        code: "B101",
        title: "🔁 Následná provize",
        amount: 3_297.408,
        excludeFromTotal: true,
      },
      { title: "📅 Provize za rok", amount: 659.48 },
    ]);
  });

  it("leaves a regular contract result unchanged", () => {
    const items = [{ code: "A101", title: "Okamžitá provize", amount: 500 }];

    expect(
      applyTipContractAdjustmentToCommissionResult({
        product: "cppAuto",
        tipsterPercent: null,
        total: 500,
        items,
      })
    ).toEqual({ items, total: 500 });
  });
});
