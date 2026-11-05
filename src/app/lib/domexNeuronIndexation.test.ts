import { describe, expect, it } from "vitest";
import { resolveDomexNeuronIndexation } from "./domexNeuronIndexation";

const contract = {
  productKey: "domexneuron" as const, premiumIndexationEnabled: true,
  frequencyRaw: "annual", inputAmount: 12_000, calculationInputAmount: 12_000,
  position: "poradce1" as const, policyStartDate: "2026-11-05",
};
const row = { productCode: "CPP_DOMEX+", commissionCode: "B101", basePremium: 12_600, commission: 350.28, source: "own" as const };
const resolve = (changes: Partial<Parameters<typeof resolveDomexNeuronIndexation>[0]> = {}) =>
  resolveDomexNeuronIndexation({ contract, row, referenceDate: "01.11.2027 - 30.11.2027", ...changes });

describe("DOMEX Neuron observed indexation", () => {
  it("recognizes a proven anniversary increase without projecting inflation", () => {
    expect(resolve()).toMatchObject({ applicable: true, status: "confirmed", annualPremium: 12_600,
      paymentPremium: 12_600, expectedCommission: 350.28, anniversaryNumber: 1 });
  });

  it.each([false, null, undefined])("does not accept automatic growth for flag %s", premiumIndexationEnabled => {
    expect(resolve({ contract: { ...contract, premiumIndexationEnabled } })).toMatchObject({ applicable: true, status: "disabled" });
  });

  it.each(["A101", "NB101"])("preserves ordinary behavior for %s", commissionCode => {
    expect(resolve({ row: { ...row, commissionCode } })).toEqual({ applicable: false, status: "not_applicable" });
  });

  it.each([
    { frequency: "semiannual", input: 6_000, base: 12_600, commission: 175.14, period: "annual", payment: 6_300 },
    { frequency: "semiannual", input: 6_000, base: 6_300, commission: 175.14, period: "payment", payment: 6_300 },
    { frequency: "quarterly", input: 3_000, base: 12_600, commission: 87.57, period: "annual", payment: 3_150 },
    { frequency: "monthly", input: 1_000, base: 1_050, commission: 29.19, period: "payment", payment: 1_050 },
  ])("resolves $frequency $period base from the actual commission", ({ frequency, input, base, commission, period, payment }) => {
    expect(resolve({ contract: { ...contract, frequencyRaw: frequency, inputAmount: input, calculationInputAmount: input },
      row: { ...row, basePremium: base, commission } })).toMatchObject({ status: "confirmed",
      basePremiumPeriod: period, paymentPremium: payment, annualPremium: 12_600 });
  });

  it.each([
    { commission: 400 }, { commission: -350.28 }, { basePremium: 0 }, { basePremium: Number.NaN },
    { productCode: "UNKNOWN" },
  ])("does not turn unsupported evidence into a premium: %j", patch => {
    expect(resolve({ row: { ...row, ...patch } }).status).toBe("unproven");
  });

  it.each(["2027-11-04", "01.10.2027 - 31.10.2027", "31.02.2028", null])("requires a valid source date at or after the anniversary: %s", referenceDate => {
    expect(resolve({ referenceDate }).status).toBe("unproven");
  });

  it("requires the correct anniversary installment rather than any subsequent B", () => {
    expect(resolve({ contract: { ...contract, frequencyRaw: "quarterly", inputAmount: 3000 },
      row: { ...row, commissionCode: "B102", commission: 87.57 } }).status).toBe("unproven");
  });

  it("does not infer a manager coefficient from the paid amount", () => {
    expect(resolve({ row: { ...row, source: "manager" } }).status).toBe("unproven");
    expect(resolve({ row: { ...row, source: "manager", commission: 126 }, coefficient: 0.01 }).status).toBe("confirmed");
  });

  it("is stable after the observed premium was already saved", () => {
    expect(resolve({ contract: { ...contract, effectiveInputAmount: 12_600 } }).status).toBe("confirmed");
    expect(resolve({ previousAnnualPremium: 13_000 }).status).toBe("unproven");
  });

  it("does not accept an explicit period that contradicts the actual commission", () => {
    expect(resolve({ contract: { ...contract, frequencyRaw: "semiannual", inputAmount: 6000 },
      row: { ...row, commission: 175.14 }, confirmedBasePeriod: "payment" }).status).toBe("unproven");
  });
});
