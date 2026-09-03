import { describe, expect, it } from "vitest";

import {
  calculateDomexNeuron,
  DOMEX_NEURON_COEFFICIENT_VALID_FROM,
  domexNeuronImmediateCoefficient,
  domexNeuronSubsequentCoefficient,
} from "./domexNeuron";
import {
  minimumSupportedContractSignedDateForProduct,
  productCoefficientValidityError,
} from "./coefficientSets";

describe("DOMEX NEURON commission formula", () => {
  it("contains the supplied A101 and B101 coefficients", () => {
    expect(domexNeuronImmediateCoefficient("poradce1")).toBe(0.1108);
    expect(domexNeuronSubsequentCoefficient("poradce1")).toBe(0.0278);
    expect(domexNeuronImmediateCoefficient("poradce10")).toBe(0.2558);
    expect(domexNeuronSubsequentCoefficient("poradce10")).toBe(0.064);
    expect(domexNeuronImmediateCoefficient("manazer9")).toBe(0.3124);
    expect(domexNeuronSubsequentCoefficient("manazer9")).toBe(0.0781);
    expect(domexNeuronImmediateCoefficient("manazer10")).toBe(0.336);
    expect(domexNeuronSubsequentCoefficient("manazer10")).toBe(0.084);
  });

  it.each([
    ["quarterly", "A101-A104", "B101-B104", 4],
    ["semiannual", "A101-A102", "B101-B102", 2],
    ["annual", "A101", "B101", 1],
  ] as const)(
    "uses installment codes and annual multiplier for %s payments",
    (frequency, immediateCode, subsequentCode, multiplier) => {
      const result = calculateDomexNeuron(1_000, frequency, "manazer9");

      expect(result.items[0]).toMatchObject({ code: immediateCode });
      expect(result.items[0]?.amount).toBeCloseTo(312.4, 6);
      expect(result.items[1]).toMatchObject({
        code: subsequentCode,
        excludeFromTotal: true,
      });
      expect(result.items[1]?.amount).toBeCloseTo(78.1, 6);
      expect(result.items[2]?.amount).toBeCloseTo(312.4 * multiplier, 6);
      expect(result.items[3]?.amount).toBeCloseTo(78.1 * multiplier, 6);
      expect(result.total).toBeCloseTo(312.4 * multiplier, 6);
    }
  );

  it("rejects contract dates before the coefficient validity date", () => {
    expect(DOMEX_NEURON_COEFFICIENT_VALID_FROM).toBe("2026-09-01");
    expect(minimumSupportedContractSignedDateForProduct("domexneuron")).toBe(
      "2026-09-01"
    );
    expect(productCoefficientValidityError("domexneuron", "2026-08-31")).toContain(
      "01. 09. 2026"
    );
    expect(productCoefficientValidityError("domexneuron", "2026-09-01")).toBeNull();
  });
});
