import { describe, expect, it } from "vitest";
import { formatMoneyValue, formatPremium, moneyInputValue } from "./money";

describe("Czech comparison amounts", () => {
  it.each([
    ["1045", "1 045 Kč"], ["12345", "12 345 Kč"], ["1234567", "1 234 567 Kč"],
    ["12345,50", "12 345,50 Kč"], ["12345.50", "12 345,50 Kč"], ["12.345,50", "12 345,50 Kč"],
    ["1\u00a0045 Kč", "1 045 Kč"], ["0", "0 Kč"], ["", ""], ["Bez limitu", "Bez limitu"],
    ["500 EUR", "500 EUR"], ["12345678901234567890", "12 345 678 901 234 567 890 Kč"],
  ])("formats %s without changing its value", (value, expected) => {
    expect(formatMoneyValue(value)).toBe(expected);
    expect(formatMoneyValue(formatMoneyValue(value))).toBe(expected);
  });

  it("keeps a decimal separator during editing and avoids duplicating daily or monthly units", () => {
    expect(moneyInputValue("1045,")).toBe("1 045,");
    expect(moneyInputValue("12345 Kč")).toBe("12 345");
    expect(formatMoneyValue("12345 Kč", "Kč/den")).toBe("12 345 Kč/den");
    expect(formatMoneyValue("12345 Kč/měsíc", "Kč/měsíc")).toBe("12 345 Kč/měsíc");
  });

  it("formats premiums while retaining their payment frequency or custom wording", () => {
    expect(formatPremium("12345")).toBe("12 345 Kč");
    expect(formatPremium("2.588 Kč čtvrtletně")).toBe("2 588 Kč čtvrtletně");
    expect(formatPremium("1045 / měsíc")).toBe("1 045 Kč / měsíc");
    expect(formatPremium("1045,50 Kč / měsíc")).toBe("1 045,50 Kč / měsíc");
    expect(formatPremium("Dle individuální nabídky")).toBe("Dle individuální nabídky");
  });
});
