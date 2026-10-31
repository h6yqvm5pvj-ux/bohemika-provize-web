import { describe, expect, it, vi } from "vitest";
import {
  applyCalculatorPdfFormValues,
  createEmptyAutoPdfFormValues,
  createEmptyPropertyPdfFormValues,
  mapReviewPdfFormValues,
  mapSinglePdfFormValues,
  pdfImportResetValues,
} from "./calculatorPdfFormValues";
import type { CalculatorPdfFormSetters } from "./calculatorPdfFormTypes";

describe("single PDF form mapping", () => {
  it("maps contract identity, dates, premium and an allowed frequency without mutating parser data", () => {
    const parsed = Object.freeze({
      contractNumber: "1234567890", clientName: "Jana Testovací", contractSignedDate: "2026-10-01",
      policyStartDate: "2026-11-01", policyEndDate: "2027-11-01", amount: 1250.5, frequency: "quarterly",
    });
    expect(mapSinglePdfFormValues("cppAuto", parsed)).toEqual({
      values: { contractNumber: "1234567890", clientName: "Jana Testovací", contractSignedDate: "2026-10-01",
        policyStartDate: "2026-11-01", policyEndDate: "2027-11-01", amountText: "1250.5",
        frequency: "quarterly", pensionTargetAge: null },
      applied: 6,
    });
  });

  it("leaves absent optional fields untouched and distinguishes an explicit empty text field", () => {
    expect(mapSinglePdfFormValues("cppAuto", {}).values).not.toHaveProperty("contractNumber");
    expect(mapSinglePdfFormValues("cppAuto", {}).values).not.toHaveProperty("autoCarMake");
    expect(mapSinglePdfFormValues("cppAuto", { carMake: "  " }).values.autoCarMake).toBe("");
    expect(mapSinglePdfFormValues("cppAuto", { policyEndDate: "" }).values.policyEndDate).toBe("");
  });

  it.each(["conseqzenit", "cppPPRbez", "cppPPRs"] as const)("clears missing required identity and premium fields for %s", (product) => {
    expect(mapSinglePdfFormValues(product, {}).values).toMatchObject({
      contractNumber: "", clientName: "", policyStartDate: "", contractSignedDate: "", amountText: "",
    });
  });

  it("resets FLEXI renovation amounts and guarantee status before using a new premium", () => {
    expect(mapSinglePdfFormValues("flexi", {}).values).toMatchObject({
      amountText: "", renovationOriginalPremiumText: "", renovationIncreaseText: "", renovationGuaranteeStatus: "unknown",
    });
    expect(mapSinglePdfFormValues("flexi", { amount: 704 }).values.amountText).toBe("704");
  });

  it("keeps the pension target age only for its product", () => {
    expect(mapSinglePdfFormValues("conseqzenit", { targetAge: 65 }).values.pensionTargetAge).toBe(65);
    expect(mapSinglePdfFormValues("cppAuto", { targetAge: 65 }).values.pensionTargetAge).toBeNull();
  });

  it("does not replace payment frequency with an unsupported parser value", () => {
    expect(mapSinglePdfFormValues("neon", { frequency: "annual" }).values).not.toHaveProperty("frequency");
    expect(mapSinglePdfFormValues("cppAuto", { frequency: "weekly" }).values).not.toHaveProperty("frequency");
    expect(mapSinglePdfFormValues("neon", { frequency: "monthly" }).values.frequency).toBe("monthly");
  });

  it("clamps durations and accepts only a supported KOMPLEX variant", () => {
    expect(mapSinglePdfFormValues("flexi", { durationYears: 999 }).values.durationYears).toBe(80);
    expect(mapSinglePdfFormValues("neon", { durationYears: 0 }).values.durationYears).toBe(1);
    expect(mapSinglePdfFormValues("maxcizinkomplex", { durationMonths: 999 }).values.durationMonths).toBe(240);
    expect(mapSinglePdfFormValues("maxcizinkomplex", { durationMonths: 12.9 }).values.durationMonths).toBe(12);
    expect(mapSinglePdfFormValues("maxcizinkomplex", { maxCizinKomplexVariant: "premium" }).values.maxCizinKomplexVariant).toBe("premium");
    expect(mapSinglePdfFormValues("maxcizinkomplex", { maxCizinKomplexVariant: "invalid" }).values).not.toHaveProperty("maxCizinKomplexVariant");
  });
});

describe("PDF coverage details", () => {
  it.each([null, "1000", NaN, Infinity, -Infinity, {}, []])("does not coerce an invalid numeric coverage limit: %j", (limit) => {
    const { values, applied } = mapSinglePdfFormValues("cppAuto", { carAddonGlassLimit: limit, domexPropertySumInsured: limit });
    expect(values.autoCarAddonGlassLimit).toBeNull();
    expect(values.domexPropertySumInsured).toBeNull();
    expect(values).not.toHaveProperty("autoCarAddonGlass");
    expect(applied).toBe(0);
  });

  it("keeps zero limits and enables the corresponding coverage even when its flag is false", () => {
    const { values, applied } = mapSinglePdfFormValues("cppAuto", { carAddonGlass: false, carAddonGlassLimit: 0 });
    expect(values).toMatchObject({ autoCarAddonGlass: true, autoCarAddonGlassLimit: 0 });
    expect(applied).toBe(1);
  });

  it("rounds finite detail amounts, trims text and requires actual boolean flags", () => {
    const { values, applied } = mapSinglePdfFormValues("domex", {
      domexAddress: "  Testovací 1  ", domexPropertySumInsured: 1000.6,
      domexLiabilityMobile: "true", domexAssistancePlus: true, carHullRiskTheft: "true",
    });
    expect(values).toMatchObject({ domexAddress: "Testovací 1", domexPropertySumInsured: 1001,
      domexLiabilityMobile: false, domexAssistancePlus: true, autoCarHullRiskTheft: false });
    expect(applied).toBe(3);
  });

  it("gives a textual hull value precedence over a numeric sum and clears the amount draft", () => {
    const { values, applied } = mapSinglePdfFormValues("allianzAuto", { carHullSumInsured: 500000, carHullSumInsuredText: " Obvyklá cena vozidla " });
    expect(values).toMatchObject({ autoCarHullSumInsured: null, autoCarHullSumInsuredText: "Obvyklá cena vozidla", autoCarHullSumInsuredDraft: "" });
    expect(applied).toBe(2);
    expect(mapSinglePdfFormValues("allianzAuto", { carHullSumInsured: 500000, carHullSumInsuredText: " " }).values.autoCarHullSumInsured).toBe(500000);
  });

  it("preserves the distinct ČPP bundle precedence in single import and batch review", () => {
    const parsed = { carLiabilityLimit: 200000000, carAddonSmartGap: false, carAddonServisPro: false };
    expect(mapSinglePdfFormValues("cppAuto", parsed)).toMatchObject({
      values: { autoCarAddonSmartGap: false, autoCarAddonServisPro: false }, applied: 3,
    });
    expect(mapReviewPdfFormValues("cppAuto", parsed)).toMatchObject({ autoCarAddonSmartGap: true, autoCarAddonServisPro: true });
    expect(mapSinglePdfFormValues("allianzAuto", { carLiabilityLimit: 200000000 }).values).not.toHaveProperty("autoCarAddonSmartGap");
  });

  it("maps only known NEON risks and creates independent detail objects", () => {
    const riskFields = Object.freeze({ deathAmount: 1000000, waiverInvalidity: "true", travelInsurance: true, admin: true });
    const first = mapSinglePdfFormValues("neon", { riskFields });
    expect(first.values.neonPdfDetailFields).toMatchObject({ version: "neon_life", deathAmount: "1000000", waiverInvalidity: false, travelInsurance: true });
    expect(first.values.neonPdfDetailFields).not.toHaveProperty("admin");
    expect(first.applied).toBe(3);
    const second = mapSinglePdfFormValues("neon", { riskFields: {} });
    expect(second.values.neonPdfDetailFields?.deathAmount).toBe("");
    expect(second.values.neonPdfDetailFields).not.toBe(first.values.neonPdfDetailFields);
    expect(mapSinglePdfFormValues("flexi", { riskFields }).values).not.toHaveProperty("neonPdfDetailFields");
  });
});

describe("batch review and form resets", () => {
  it("clears old vehicle fields when opening a property row, then clears property fields for the next vehicle", () => {
    const vehicle = mapReviewPdfFormValues("cppAuto", { clientName: "Klient A", carPlate: "TEST01", carAddonGlassLimit: 5000 });
    const property = { ...vehicle, ...mapReviewPdfFormValues("domex", { clientName: "Klient B", domexAddress: "Testovací 1" }) };
    expect(property).toMatchObject({ clientName: "Klient B", autoCarPlate: "", autoCarAddonGlass: false, autoCarAddonGlassLimit: null, domexAddress: "Testovací 1" });
    const nextVehicle = { ...property, ...mapReviewPdfFormValues("cppAuto", { clientName: "Klient C" }) };
    expect(nextVehicle).toMatchObject({ clientName: "Klient C", autoCarPlate: "", domexAddress: "", domexPropertySumInsured: null });
  });

  it.each(["1000", NaN, Infinity, null])("clears an invalid batch premium instead of keeping the previous row's value: %j", (amount) => {
    expect(mapReviewPdfFormValues("cppAuto", { amount }).amountText).toBe("");
  });

  it("uses the product's fallback frequency when reviewing an unsupported or missing frequency", () => {
    expect(mapReviewPdfFormValues("neon", { frequency: "annual" }).frequency).toBe("monthly");
    expect(mapReviewPdfFormValues("cppAuto", {}).frequency).toBe("quarterly");
    expect(mapReviewPdfFormValues("cppAuto", { frequency: "quarterly" }).frequency).toBe("quarterly");
  });

  it("clears previous coverage before an import, independently of whether parsing succeeds", () => {
    const previous = { autoCarMake: "Old car", autoCarAddonGlass: true, autoCarAddonGlassLimit: 5000 };
    expect({ ...previous, ...pdfImportResetValues("cppAuto") }).toMatchObject({ autoCarMake: "", autoCarAddonGlass: false, autoCarAddonGlassLimit: null });
    expect(pdfImportResetValues("domex")).toEqual(createEmptyPropertyPdfFormValues());
    expect(pdfImportResetValues("cppAuto")).toEqual(createEmptyAutoPdfFormValues());
    const first = pdfImportResetValues("neon");
    const second = pdfImportResetValues("neon");
    expect(first.neonPdfDetailFields).not.toBe(second.neonPdfDetailFields);
    expect(pdfImportResetValues("comfortcc")).toEqual({});
  });

  it("does not copy ownership, permissions or unrelated parser fields into form state", () => {
    const parsed = JSON.parse('{"clientName":"Jana Testovací","ownerEmail":"other@example.com","role":"admin","__proto__":{"admin":true}}');
    for (const values of [mapSinglePdfFormValues("cppAuto", parsed).values, mapReviewPdfFormValues("cppAuto", parsed)]) {
      expect(values).not.toHaveProperty("ownerEmail");
      expect(values).not.toHaveProperty("role");
      expect(Object.hasOwn(values, "__proto__")).toBe(false);
      expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
    }
  });

  it("dispatches explicit null, false and empty text while leaving undefined updates alone", () => {
    const setters = { clientName: vi.fn(), autoCarAddonGlass: vi.fn(), autoCarHullSumInsured: vi.fn(), amountText: vi.fn() };
    applyCalculatorPdfFormValues({ clientName: undefined, autoCarAddonGlass: false, autoCarHullSumInsured: null, amountText: "" }, setters as unknown as CalculatorPdfFormSetters);
    expect(setters.clientName).not.toHaveBeenCalled();
    expect(setters.autoCarAddonGlass).toHaveBeenCalledExactlyOnceWith(false);
    expect(setters.autoCarHullSumInsured).toHaveBeenCalledExactlyOnceWith(null);
    expect(setters.amountText).toHaveBeenCalledExactlyOnceWith("");
  });
});
