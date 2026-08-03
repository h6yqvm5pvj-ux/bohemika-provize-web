import { describe, expect, it } from "vitest";

import {
  calculateDomex,
  domexCoefficient,
  domexSubsequentCoefficient,
  domexSubsequentPayoutYears,
  isDomexEarlyHistoricalPeriod,
  isDomexHistoricalPeriod,
} from "./domex";
import {
  coefficientSetSignedDateForProduct,
  defaultCoefficientSetForProduct,
  minimumSupportedContractSignedDateForProduct,
} from "./coefficientSets";

describe("DOMEX commission formula", () => {
  it("classifies the 2017 and 2023 historical periods by signed date", () => {
    expect(isDomexHistoricalPeriod("2017-05-31")).toBe(false);
    expect(isDomexEarlyHistoricalPeriod("2017-06-01")).toBe(true);
    expect(isDomexHistoricalPeriod("2017-06-01")).toBe(true);
    expect(isDomexEarlyHistoricalPeriod("2023-05-31")).toBe(true);
    expect(isDomexEarlyHistoricalPeriod("2023-06-01")).toBe(false);
    expect(isDomexHistoricalPeriod("2023-06-01")).toBe(true);
    expect(isDomexHistoricalPeriod("2024-08-31")).toBe(true);
    expect(isDomexHistoricalPeriod("2024-09-01")).toBe(false);
    expect(isDomexHistoricalPeriod("invalid")).toBe(false);
  });

  it("uses the DOMEX PLUS coefficient table before June 2023", () => {
    expect(domexCoefficient("poradce1", "2017-06-01")).toBeCloseTo(0.16, 4);
    expect(domexSubsequentCoefficient("poradce1", "2017-06-01")).toBeCloseTo(0.03, 4);
    expect(domexCoefficient("poradce10", "2023-05-31")).toBeCloseTo(0.238, 4);
    expect(domexSubsequentCoefficient("poradce10", "2023-05-31")).toBeCloseTo(0.0595, 4);
    expect(domexCoefficient("manazer10", "2023-05-31")).toBeCloseTo(0.26, 4);
    expect(domexSubsequentCoefficient("manazer10", "2023-05-31")).toBeCloseTo(0.065, 4);
  });

  it("switches to the following historical table on 1 June 2023", () => {
    expect(domexCoefficient("poradce1", "2023-06-01")).toBeCloseTo(0.1108, 4);
    expect(domexSubsequentCoefficient("poradce1", "2023-06-01")).toBeCloseTo(0.0278, 4);
    expect(domexSubsequentPayoutYears("2023-05-31")).toBe(4);
    expect(domexSubsequentPayoutYears("2023-06-01")).toBe(4);
    expect(domexSubsequentPayoutYears("2024-09-01")).toBeNull();
  });

  it("calculates per-payment and annual values for the 2017 historical table", () => {
    const result = calculateDomex(1000, "quarterly", "manazer4", "2023-05-31");

    expect(result.total).toBeCloseTo(880, 2);
    expect(result.items[0]).toMatchObject({ code: "A101-A104" });
    expect(result.items[0]?.amount).toBeCloseTo(220, 2);
    expect(result.items[1]).toMatchObject({
      code: "B101-B104",
      excludeFromTotal: true,
      note: "Vyplácí se maximálně 4 roky.",
    });
    expect(result.items[1]?.amount).toBeCloseTo(55, 2);
    expect(result.items[2]?.amount).toBeCloseTo(880, 2);
    expect(result.items[3]).toMatchObject({ excludeFromTotal: true });
    expect(result.items[3]?.amount).toBeCloseTo(220, 2);
  });

  it("maps DOMEX coefficient set helpers to all three effective dates", () => {
    expect(minimumSupportedContractSignedDateForProduct("domex")).toBe("2017-06-01");
    expect(defaultCoefficientSetForProduct("domex", "2023-05-31")).toBe("earlyHistorical");
    expect(defaultCoefficientSetForProduct("domex", "2023-06-01")).toBe("historical");
    expect(defaultCoefficientSetForProduct("domex", "2024-09-01")).toBe("current");
    expect(coefficientSetSignedDateForProduct("domex", "earlyHistorical")).toBe("2017-06-01");
    expect(coefficientSetSignedDateForProduct("domex", "historical")).toBe("2023-06-01");
    expect(coefficientSetSignedDateForProduct("domex", "current")).toBe("2024-09-01");
  });
});
