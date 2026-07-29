import { describe, expect, it } from "vitest";

import {
  isImmediateCommissionCode,
  isImmediateCommissionTitle,
  sumImmediateCommissionItems,
} from "./commissionTotals";
import { calculateFlexi } from "./productFormulas/flexi";

describe("commission total helpers", () => {
  it("sums only immediate split commission code items", () => {
    const immediate = sumImmediateCommissionItems([
      { title: "Provize A101", amount: 3373.45, code: "A101" },
      { title: "Provize B0301", amount: 1248.37, code: "B0301" },
      { title: "Provize 50% z B3601", amount: 1878.52, code: "B3601_HALF" },
      { title: "Provize po 3 letech", amount: 3124.04, code: "B3601" },
      { title: "Celkem okamžitá provize", amount: 6500.34, code: "A101" },
      { title: "Celkem", amount: 9624.38, code: "TOTAL" },
    ]);

    expect(immediate).toBeCloseTo(6500.34, 2);
  });

  it("recognizes legacy immediate titles with Czech diacritics", () => {
    expect(isImmediateCommissionTitle("💸 Okamžitá provize")).toBe(true);
    expect(isImmediateCommissionTitle("Okamžitá (získatelská) provize")).toBe(true);
    expect(isImmediateCommissionTitle("Získatelská provize")).toBe(true);
    expect(isImmediateCommissionTitle("Celkem okamžitá provize")).toBe(false);
  });

  it("recognizes immediate code aliases but not full later B36 payouts", () => {
    expect(isImmediateCommissionCode("A112")).toBe(true);
    expect(isImmediateCommissionCode("B036_HALF")).toBe(true);
    expect(isImmediateCommissionCode("B3601")).toBe(false);
    expect(isImmediateCommissionCode("TOTAL")).toBe(false);
  });

  it("sums only immediate FLEXI Kooperativa split items", () => {
    const result = calculateFlexi(1000, "poradce5", "accelerated", 10);
    const immediate = sumImmediateCommissionItems(result.items);

    expect(result.items.map((item) => item.code)).toEqual([
      "A101",
      "B0301",
      "B36_HALF",
      "B36",
      "B48",
      "B201-B206",
      "TOTAL",
    ]);
    expect(immediate).toBeCloseTo(
      result.items
        .filter((item) => ["A101", "B0301", "B36_HALF"].includes(item.code ?? ""))
        .reduce((sum, item) => sum + item.amount, 0),
      2
    );
  });
});
