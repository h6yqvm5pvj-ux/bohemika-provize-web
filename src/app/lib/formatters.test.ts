import { describe, expect, it, vi } from "vitest";

import { formatMoney } from "./formatters";

function spyOnFormatter() {
  const NumberFormat = Intl.NumberFormat;
  return vi.spyOn(Intl, "NumberFormat").mockImplementation(function (locales, options) {
    return new NumberFormat(locales, options);
  } as typeof Intl.NumberFormat);
}

describe("formatMoney", () => {
  it("preserves Czech grouping, rounding and separate currency labels", () => {
    expect(formatMoney(1234567.89)).toBe("1.234.568 Kč");
    expect(formatMoney(-1234.5)).toBe("-1.235 Kč");
    expect(formatMoney(1234, { currencyLabel: "" })).toBe("1.234 ");
    expect(formatMoney(1234.5, { minFractionDigits: 2, maxFractionDigits: 2 })).toBe("1.234,50 Kč");
    expect(formatMoney(1234.5, { locale: "en-US", currencyLabel: "USD", maxFractionDigits: 2 })).toBe("1,234.5 USD");
  });

  it("keeps missing and non-positive amount behavior", () => {
    for (const value of [null, undefined, NaN, Infinity]) {
      expect(formatMoney(value)).toBe("0 Kč");
      expect(formatMoney(value, { emptyValueLabel: "—" })).toBe("—");
    }
    expect(formatMoney(0, { nonPositiveAsEmpty: true, emptyValueLabel: "—" })).toBe("—");
    expect(formatMoney(-1, { nonPositiveAsEmpty: true, emptyValueLabel: "—" })).toBe("—");
  });

  it("reuses formatter configuration across different amounts and currency labels", () => {
    const constructor = spyOnFormatter();
    try {
      expect(formatMoney(1.25, { locale: "de-DE", minFractionDigits: 3, maxFractionDigits: 3 })).toBe("1,250 Kč");
      expect(formatMoney(2.5, { locale: "de-DE", minFractionDigits: 3, maxFractionDigits: 3, currencyLabel: "EUR" })).toBe("2,500 EUR");
      expect(constructor).toHaveBeenCalledTimes(1);
      expect(formatMoney(2.5, { locale: "de-DE", maxFractionDigits: 1 })).toBe("2,5 Kč");
      expect(constructor).toHaveBeenCalledTimes(2);
    } finally {
      constructor.mockRestore();
    }
  });

  it("bounds retained configurations while keeping formatting correct after eviction", () => {
    const expected = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(1234.125);
    formatMoney(1234.125, { locale: "fr-FR", maxFractionDigits: 3 });
    for (let digits = 0; digits < 40; digits++) {
      formatMoney(1, { locale: "en-GB", maxFractionDigits: digits });
    }
    const constructor = spyOnFormatter();
    try {
      expect(formatMoney(1234.125, { locale: "fr-FR", maxFractionDigits: 3 })).toBe(`${expected} Kč`);
      expect(constructor).toHaveBeenCalledTimes(1);
    } finally {
      constructor.mockRestore();
    }
  });
});
