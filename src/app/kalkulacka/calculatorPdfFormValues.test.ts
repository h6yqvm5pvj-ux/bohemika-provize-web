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
import { domexNeuronDataFixture } from "../../../tests/helpers/domexNeuronFixture";

describe("single PDF form mapping", () => {
  it("shows Kooperativa insured items after single and batch PDF import and clears stale items", () => {
    const parsed = { insuredCoverages: [{ name: "Domácnost", variant: "KOMFORT", deductible: 500, sumInsured: 500_000 }] };
    expect(mapSinglePdfFormValues("koopmajetekobcan", parsed).values.koopInsuredCoverages).toEqual(parsed.insuredCoverages);
    expect(mapReviewPdfFormValues("koopmajetekobcan", parsed).koopInsuredCoverages).toEqual(parsed.insuredCoverages);
    expect(pdfImportResetValues("koopmajetekobcan").koopInsuredCoverages).toEqual([]);
    expect(mapReviewPdfFormValues("koopmajetekobcan", {}).koopInsuredCoverages).toEqual([]);
  });
  it("maps, resets, and scopes Kooperativa employee liability details", () => {
    const detail = {
      occupation: "Uklízečka",
      vehicleRelatedDamage: false,
      annualLimit: 150_000,
      territorialScope: "Česká republika",
      deductible: "10 % min. 1 000 Kč",
    };
    expect(mapSinglePdfFormValues("koopodzam", { employeeLiabilityDetail: detail }).values.koopOdzamDetail).toEqual(detail);
    expect(mapReviewPdfFormValues("koopodzam", { employeeLiabilityDetail: detail }).koopOdzamDetail).toEqual(detail);
    expect(pdfImportResetValues("koopodzam").koopOdzamDetail).toBeNull();
    expect(mapReviewPdfFormValues("koopodzam", {}).koopOdzamDetail).toBeNull();
    expect(mapSinglePdfFormValues("domex", { employeeLiabilityDetail: detail }).values).not.toHaveProperty("koopOdzamDetail");
    expect(mapReviewPdfFormValues("domex", { employeeLiabilityDetail: detail }).koopOdzamDetail).toBeNull();
  });
  it.each([true, false])("preserves explicit DOMEX Neuron indexation in single and batch-review mappings (%s)", (premiumIndexationEnabled) => {
    expect(mapSinglePdfFormValues("domexneuron", { premiumIndexationEnabled }).values.premiumIndexationEnabled).toBe(premiumIndexationEnabled);
    expect(mapReviewPdfFormValues("domexneuron", { premiumIndexationEnabled }).premiumIndexationEnabled).toBe(premiumIndexationEnabled);
  });

  it.each([undefined, null, "ANO", "NE", 1, 0, {}])("keeps missing or manipulated indexation unknown (%j)", (premiumIndexationEnabled) => {
    expect(mapSinglePdfFormValues("domexneuron", { premiumIndexationEnabled }).values.premiumIndexationEnabled).toBeNull();
    expect(mapReviewPdfFormValues("domexneuron", { premiumIndexationEnabled }).premiumIndexationEnabled).toBeNull();
  });

  it("resets indexation before another Neuron PDF and ignores the field for other products", () => {
    expect(pdfImportResetValues("domexneuron").premiumIndexationEnabled).toBeNull();
    expect(mapSinglePdfFormValues("domex", { premiumIndexationEnabled: true }).values).not.toHaveProperty("premiumIndexationEnabled");
    expect(mapReviewPdfFormValues("domex", { premiumIndexationEnabled: true }).premiumIndexationEnabled).toBeNull();
  });

  it("keeps a renewing DOMEX term end separate from the effective contract end", () => {
    const { values } = mapSinglePdfFormValues("domexneuron", {
      automaticRenewal: true, policyTermEndDate: "2027-10-31", policyEndDate: null,
    });
    expect(values).toMatchObject({ automaticRenewal: true, policyTermEndDate: "2027-10-31", policyEndDate: "" });
    expect(pdfImportResetValues("domexneuron")).toMatchObject({ automaticRenewal: null, policyTermEndDate: "", policyEndDate: "" });
  });

  it("sets the effective end only for a fixed term DOMEX and preserves unknown renewal", () => {
    expect(mapSinglePdfFormValues("domexneuron", { automaticRenewal: false, policyTermEndDate: "2027-10-31" }).values)
      .toMatchObject({ automaticRenewal: false, policyEndDate: "2027-10-31" });
    expect(mapSinglePdfFormValues("domexneuron", { automaticRenewal: "ANO", policyTermEndDate: "2027-10-31" }).values)
      .toMatchObject({ automaticRenewal: null, policyEndDate: "" });
    expect(mapReviewPdfFormValues("domexneuron", { automaticRenewal: true, policyTermEndDate: "2027-10-31", policyEndDate: "2027-10-31" }))
      .toMatchObject({ automaticRenewal: true, policyEndDate: "", policyTermEndDate: "2027-10-31" });
  });
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
    expect(mapSinglePdfFormValues("slaviaauto", {}).values).not.toHaveProperty("contractNumber");
    expect(mapSinglePdfFormValues("cppAuto", {}).values).not.toHaveProperty("autoCarMake");
    expect(mapSinglePdfFormValues("cppAuto", { carMake: "  " }).values.autoCarMake).toBe("");
    expect(mapSinglePdfFormValues("cppAuto", { policyEndDate: "" }).values.policyEndDate).toBe("");
  });

  it("never keeps a previous CPP policyholder, identifier or date when the next PDF cannot prove it", () => {
    const previous = { clientName: "Předchozí Klient", contractNumber: "0012345678", policyStartDate: "2026-10-01", contractSignedDate: "2026-09-30" };
    expect({ ...previous, ...mapSinglePdfFormValues("cppAuto", { amount: 4200 }).values }).toMatchObject({
      clientName: "", contractNumber: "", policyStartDate: "", contractSignedDate: "", amountText: "4200",
    });
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
  it("retains every Neuron object and extraction status in single and batch review imports", () => {
    const domexNeuron = domexNeuronDataFixture();
    const parsed = { domexNeuron };
    for (const values of [mapSinglePdfFormValues("domexneuron", parsed).values, mapReviewPdfFormValues("domexneuron", parsed)]) {
      expect(values.domexNeuron).toEqual(domexNeuron);
      expect(values.domexNeuron).not.toBe(domexNeuron);
      expect(values.domexNeuron?.objects).toHaveLength(3);
    }
    expect(pdfImportResetValues("domexneuron").domexNeuron).toBeNull();
    expect(mapReviewPdfFormValues("domex", parsed).domexNeuron).toBeNull();
    expect(mapSinglePdfFormValues("domex", parsed).values).not.toHaveProperty("domexNeuron");
  });

  it("rejects malformed model data without borrowing a previous PDF's objects", () => {
    const bad = { ...domexNeuronDataFixture(), parserVersion: 99 };
    expect(mapSinglePdfFormValues("domexneuron", { domexNeuron: bad }).values.domexNeuron).toBeNull();
    expect(mapReviewPdfFormValues("domexneuron", { domexNeuron: bad }).domexNeuron).toBeNull();
    expect(mapReviewPdfFormValues("domexneuron", {}).domexNeuron).toBeNull();
  });
  it("keeps the Neuron building and household addresses and assistance variants separate", () => {
    const parsed = {
      domexPropertyAddress: "  Syntetická 1, Testov  ", domexHouseholdAddress: " Modelová 2, Testov ",
      domexPropertyAssistance: "basic", domexHouseholdAssistance: "plus",
      domexPropertyType: "dum", domexPropertyCoverage: "maxi", domexPropertySumInsured: 4_000_000,
      domexHouseholdType: "trvale", domexHouseholdCoverage: "opti", domexHouseholdSumInsured: 500_000,
    };
    for (const values of [mapSinglePdfFormValues("domexneuron", parsed).values, mapReviewPdfFormValues("domexneuron", parsed)]) {
      expect(values).toMatchObject({
        ...parsed, domexPropertyAddress: "Syntetická 1, Testov", domexHouseholdAddress: "Modelová 2, Testov",
      });
    }
  });

  it.each([null, undefined, false, true, "", "BASIC", "PLUS", "základní", 0, 1, {}])("does not infer Neuron assistance from an unsupported value: %j", assistance => {
    const parsed = { domexPropertyAssistance: assistance, domexHouseholdAssistance: assistance };
    for (const values of [mapSinglePdfFormValues("domexneuron", parsed).values, mapReviewPdfFormValues("domexneuron", parsed)]) {
      expect(values).toMatchObject({ domexPropertyAssistance: null, domexHouseholdAssistance: null });
    }
  });

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
  it("clears both Neuron locations and assistance before another PDF, without inferring cover for missing sections", () => {
    const previous = mapReviewPdfFormValues("domexneuron", {
      domexPropertyAddress: "Stará stavba 1", domexHouseholdAddress: "Stará domácnost 2",
      domexPropertyAssistance: "plus", domexHouseholdAssistance: "basic",
    });
    for (const reset of [pdfImportResetValues("domexneuron"), mapReviewPdfFormValues("domexneuron", {}), mapReviewPdfFormValues("cppAuto", {})]) {
      expect({ ...previous, ...reset }).toMatchObject({
        domexPropertyAddress: "", domexHouseholdAddress: "", domexPropertyAssistance: null, domexHouseholdAssistance: null,
      });
    }
    const householdOnly = mapReviewPdfFormValues("domexneuron", { domexHouseholdAddress: "Pouze domácnost 3", domexHouseholdAssistance: "basic" });
    expect(householdOnly).toMatchObject({ domexPropertyAddress: "", domexPropertyAssistance: null,
      domexHouseholdAddress: "Pouze domácnost 3", domexHouseholdAssistance: "basic" });
  });

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
    expect(pdfImportResetValues("cppAuto")).toEqual({ ...createEmptyAutoPdfFormValues(), clientName: "", contractNumber: "", policyStartDate: "", contractSignedDate: "" });
    const first = pdfImportResetValues("neon");
    const second = pdfImportResetValues("neon");
    expect(first.neonPdfDetailFields).not.toBe(second.neonPdfDetailFields);
    expect(pdfImportResetValues("conseqzenit")).toEqual({});
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
