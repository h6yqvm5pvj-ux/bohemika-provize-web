import { describe, expect, it } from "vitest";
import { domexNeuronDataFixture } from "../../../../tests/helpers/domexNeuronFixture";

import type { ContractDoc } from "./contractDetailTypes";
import {
  mergeEmptyContractFields,
  mergeEmptyNeonDetailFields,
  mergeEmptyPropertyDetailFields,
  mergeEmptySlaviaAutoDetailFields,
  PDF_REIMPORT_PARSERS,
} from "./contractDetailPdfReimport";

describe("PDF reimport detailu smlouvy", () => {
  it("fills the animal damage limit while preserving existing limits and an explicit non-insurance decision", () => {
    const contract = { id: "koop-auto", productKey: "kooperativaAuto", carAddonAnimalDamage: true } as ContractDoc;
    const parsed = { carAddonAnimalDamage: true, carAddonAnimalDamageLimit: 100000 };
    expect(mergeEmptyContractFields(contract, parsed)).toEqual({ updates: { carAddonAnimalDamageLimit: 100000 }, appliedCount: 1 });
    expect(mergeEmptyContractFields({ ...contract, carAddonAnimalDamageLimit: 200000 }, parsed)).toEqual({ updates: {}, appliedCount: 0 });
    expect(mergeEmptyContractFields({ ...contract, carAddonAnimalDamageLimit: 0 }, parsed)).toEqual({ updates: {}, appliedCount: 0 });
    expect(mergeEmptyContractFields({ ...contract, carAddonAnimalDamage: false }, parsed)).toEqual({ updates: {}, appliedCount: 0 });
    expect(mergeEmptyContractFields(contract, { ...parsed, carAddonAnimalDamage: false })).toEqual({ updates: {}, appliedCount: 0 });
  });

  it.each([undefined, null, "", " ", -1, 1_000_000_001, Number.NaN, Number.POSITIVE_INFINITY, true, {}, "unknown"])(
    "does not import a malformed animal damage limit (%j)", carAddonAnimalDamageLimit => {
      const contract = { id: "koop-auto", productKey: "kooperativaAuto", carAddonAnimalDamage: true } as ContractDoc;
      expect(mergeEmptyContractFields(contract, { carAddonAnimalDamageLimit })).toEqual({ updates: {}, appliedCount: 0 });
    },
  );

  it("fills the missing Kooperativa glass limit and preserves existing values and explicit non-insurance", () => {
    const contract = { id: "koop-auto", productKey: "kooperativaAuto", carAddonGlass: true } as ContractDoc;
    const parsed = { carAddonGlass: true, carAddonGlassLimit: 15000 };
    expect(mergeEmptyContractFields(contract, parsed)).toEqual({ updates: { carAddonGlassLimit: 15000 }, appliedCount: 1 });
    expect(mergeEmptyContractFields({ ...contract, carAddonGlassLimit: 20000 }, parsed)).toEqual({ updates: {}, appliedCount: 0 });
    expect(mergeEmptyContractFields({ ...contract, carAddonGlassLimit: 0 }, parsed)).toEqual({ updates: {}, appliedCount: 0 });
    expect(mergeEmptyContractFields({ ...contract, carAddonGlass: false }, parsed)).toEqual({ updates: {}, appliedCount: 0 });
    expect(mergeEmptyContractFields(contract, { ...parsed, carAddonGlass: false })).toEqual({ updates: {}, appliedCount: 0 });
  });

  it.each([undefined, null, "", " ", -1, 1_000_000_001, Number.NaN, Number.POSITIVE_INFINITY, true, {}, "unknown"])(
    "does not import a malformed glass limit (%j)", carAddonGlassLimit => {
      const contract = { id: "koop-auto", productKey: "kooperativaAuto", carAddonGlass: true } as ContractDoc;
      expect(mergeEmptyContractFields(contract, { carAddonGlassLimit })).toEqual({ updates: {}, appliedCount: 0 });
    },
  );

  it("does not fill an original FLEXI policy with dates from a change request", () => {
    const contract = { id: "original", productKey: "flexi", entryType: "contract" } as ContractDoc;
    const parsed = { isEndorsement: true, policyStartDate: "2026-12-01", contractSignedDate: "2026-11-12" };
    expect(() => mergeEmptyContractFields(contract, parsed)).toThrow("přípravu dodatku");
    expect(mergeEmptyContractFields({ ...contract, entryType: "endorsement" }, parsed).updates).toMatchObject({
      policyStartDate: "2026-12-01", contractSignedDate: "2026-11-12",
    });
  });
  it("fills free-trailer identity, dates and vehicle details without importing financial fields", () => {
    const contract = { id: "free-trailer", productKey: "cppAutoVozikZdarma", inputAmount: 0 } as ContractDoc;
    const fields = { clientName: "Ing. Jana Testovací, Ph.D.", contractNumber: "3999000001",
      contractSignedDate: "2026-11-12", policyStartDate: "2026-12-16", carMake: "TEST TRAILERS Model 12",
      carVin: "TESTABCDEFG123456", carOrv: "AAA000111", carPlate: "TEST123", carLiabilityLimit: 50_000_000 };
    const { updates, appliedCount } = mergeEmptyContractFields(contract, { ...fields, amount: 9999, frequency: "monthly" });
    expect(updates).toMatchObject(fields);
    expect(appliedCount).toBe(9);
    expect(updates).not.toHaveProperty("inputAmount");
    expect(updates).not.toHaveProperty("frequencyRaw");
    expect(mergeEmptyContractFields({ ...contract, ...fields } as ContractDoc, { ...fields, carPlate: "OTHER123" }).updates).toEqual({});
  });
  it.each([true, false])("fills unknown Neuron indexation from an explicit answer (%s)", (premiumIndexationEnabled) => {
    const contract = { id: "neuron", productKey: "domexneuron", premiumIndexationEnabled: null } as ContractDoc;
    expect(mergeEmptyContractFields(contract, { premiumIndexationEnabled })).toEqual({
      updates: { premiumIndexationEnabled }, appliedCount: 1,
    });
  });

  it.each([undefined, null, "ANO", "NE", 1, 0, {}])("does not fill indexation from an unknown or manipulated answer (%j)", (premiumIndexationEnabled) => {
    const contract = { id: "neuron", productKey: "domexneuron" } as ContractDoc;
    expect(mergeEmptyContractFields(contract, { premiumIndexationEnabled })).toEqual({ updates: {}, appliedCount: 0 });
  });

  it("preserves an existing indexation decision and restricts the field to Neuron", () => {
    const contract = { id: "neuron", productKey: "domexneuron", premiumIndexationEnabled: false } as ContractDoc;
    expect(mergeEmptyContractFields(contract, { premiumIndexationEnabled: true })).toEqual({ updates: {}, appliedCount: 0 });
    expect(mergeEmptyContractFields({ ...contract, premiumIndexationEnabled: null, productKey: "domex" }, { premiumIndexationEnabled: true })).toEqual({ updates: {}, appliedCount: 0 });
  });

  it("imports CPP Auto KLIKA and Servis PRO and preserves an explicit Extra Benefit NE", () => {
    const contract = { id: "cpp-auto", productKey: "cppAuto" } as ContractDoc;
    expect(mergeEmptyContractFields(contract, {
      carAddonKlika: true,
      carAddonKlikaLimit: 10_000,
      carAddonServisPro: true,
      carExtraBenefitProfi: false,
    })).toEqual({
      updates: {
        carAddonKlika: true,
        carAddonKlikaLimit: 10_000,
        carAddonServisPro: true,
        carExtraBenefitProfi: false,
      },
      appliedCount: 4,
    });
  });

  it("does not import CPP Auto coverages into another product", () => {
    const contract = { id: "neon", productKey: "neon" } as ContractDoc;
    expect(mergeEmptyContractFields(contract, {
      carAddonKlika: true,
      carAddonKlikaLimit: 10_000,
      carAddonServisPro: true,
      carExtraBenefitProfi: false,
    })).toEqual({ updates: {}, appliedCount: 0 });
  });

  it("imports explicit false renewal and preserves a renewable term independently", () => {
    const contract = { id: "neuron", productKey: "domexneuron" } as ContractDoc;
    expect(mergeEmptyContractFields(contract, { automaticRenewal: false, policyEndDate: "2027-11-04", policyTermEndDate: "2027-11-04" })).toEqual({
      updates: { automaticRenewal: false, policyEndDate: "2027-11-04", policyTermEndDate: "2027-11-04" }, appliedCount: 3,
    });
    expect(mergeEmptyContractFields(contract, { automaticRenewal: true, policyEndDate: "2027-11-04", policyTermEndDate: "2027-11-04" })).toEqual({
      updates: { automaticRenewal: true, policyTermEndDate: "2027-11-04" }, appliedCount: 2,
    });
    expect(mergeEmptyContractFields({ ...contract, automaticRenewal: false, policyEndDate: "2027-11-04" }, { automaticRenewal: true })).toEqual({ updates: {}, appliedCount: 0 });
  });

  it("skips a term boundary that conflicts with a preserved fixed maturity", () => {
    const contract = { id: "neuron", productKey: "domexneuron", automaticRenewal: false, policyEndDate: "2027-11-04" } as ContractDoc;
    expect(mergeEmptyContractFields(contract, { automaticRenewal: true, policyTermEndDate: "2028-11-04", clientName: "Doplněný klient" })).toEqual({
      updates: { clientName: "Doplněný klient" }, appliedCount: 1,
    });
    expect(mergeEmptyContractFields(contract, { automaticRenewal: false, policyTermEndDate: "2027-11-04" })).toEqual({
      updates: { policyTermEndDate: "2027-11-04" }, appliedCount: 1,
    });
  });

  it("doplní cílový věk z PDF i do dříve uložené DPS smlouvy", () => {
    const contract = { id: "dps-1", productKey: "conseqzenit", policyEndDate: "2040-04-12" } as ContractDoc;
    expect(mergeEmptyContractFields(contract, { targetAge: 65, policyEndDate: "2040-04-12" })).toEqual({
      updates: { pensionTargetAge: 65 }, appliedCount: 1,
    });
    expect(mergeEmptyContractFields({ ...contract, pensionTargetAge: 60 }, { targetAge: 65 })).toEqual({
      updates: {}, appliedCount: 0,
    });
    expect(mergeEmptyContractFields({ ...contract, productKey: "neon" }, { targetAge: 65 })).toEqual({
      updates: {}, appliedCount: 0,
    });
  });

  it.each([null, 0, 121, 65.5])("nedoplní neplatný cílový věk z PDF: %s", (targetAge) => {
    const contract = { id: "dps-1", productKey: "conseqzenit" } as ContractDoc;
    expect(mergeEmptyContractFields(contract, { targetAge })).toEqual({ updates: {}, appliedCount: 0 });
  });

  it("doplní pouze prázdná pole smlouvy a normalizuje číselné hodnoty", () => {
    const contract = {
      id: "contract-1",
      contractNumber: "",
      clientName: "Již vyplněný klient",
      durationYears: null,
      carAddonGlass: false,
    } as ContractDoc;

    const result = mergeEmptyContractFields(contract, {
      contractNumber: "123456789",
      clientName: "Jméno z PDF se nesmí přepsat",
      durationYears: "24",
      carAddonGlass: true,
    });

    expect(result).toEqual({
      updates: {
        contractNumber: "123456789",
        durationYears: 24,
      },
      appliedCount: 2,
    });
  });

  it("zachová vyplněné majetkové údaje a doplní zbytek z PDF", () => {
    const result = mergeEmptyPropertyDetailFields(
      { address: "Již uložená adresa", sumInsured: null },
      {
        domexAddress: "Adresa z PDF se nesmí přepsat",
        domexPropertySumInsured: "1 000 000",
        domexLiabilityMobile: true,
      }
    );

    expect(result).toEqual({
      detail: {
        address: "Již uložená adresa",
        sumInsured: 1_000_000,
        liabilityMobile: true,
      },
      appliedCount: 2,
    });
  });

  it("keeps manual Neuron locations and basic assistance while filling absent household fields", () => {
    expect(mergeEmptyPropertyDetailFields({
      propertyAddress: "Ruční stavba 1", propertyAssistance: "basic", householdAddress: null, householdAssistance: null,
    }, {
      domexPropertyAddress: "PDF stavba se nesmí přepsat", domexPropertyAssistance: "plus",
      domexHouseholdAddress: " PDF domácnost 2 ", domexHouseholdAssistance: "plus", domexHouseholdSumInsured: 500_000,
    })).toEqual({ detail: {
      propertyAddress: "Ruční stavba 1", propertyAssistance: "basic", householdAddress: "PDF domácnost 2",
      householdAssistance: "plus", householdSumInsured: 500_000,
    }, appliedCount: 3 });
  });

  it.each([false, true])("fills scalar aliases from the address-matched saved object after PDF reordering (canonical=%s)", canonical => {
    const saved = domexNeuronDataFixture();
    const pdf = domexNeuronDataFixture();
    [pdf.objects[0], pdf.objects[1]] = [pdf.objects[1], pdf.objects[0]];
    saved.objects[0].sumInsured = null;
    saved.objects[0].fields.sumInsured = "unreadable";
    const result = mergeEmptyPropertyDetailFields({
      propertyAddress: saved.objects[0].address, propertyType: "dum", sumInsured: null,
      ...(canonical ? { neuron: saved } : {}),
    }, {
      domexNeuron: pdf, domexPropertyAddress: pdf.objects[0].address, domexPropertySumInsured: pdf.objects[0].sumInsured,
    });
    expect(result.detail.propertyAddress).toBe(saved.objects[0].address);
    expect(result.detail.sumInsured).toBe(4_000_000);
    expect(result.detail.neuron?.objects[0].sumInsured).toBe(4_000_000);
    expect(result.detail.neuron?.objects[0].address).toBe(saved.objects[0].address);
  });

  it.each([null, undefined, "", false, true, "BASIC", "PLUS", 1, {}])("does not infer scoped assistance during reimport: %j", assistance => {
    expect(mergeEmptyPropertyDetailFields({}, { domexPropertyAssistance: assistance, domexHouseholdAssistance: assistance }))
      .toEqual({ detail: {}, appliedCount: 0 });
  });

  it("does not copy a shared legacy address or malformed addresses into specific Neuron locations", () => {
    expect(mergeEmptyPropertyDetailFields({ address: "Dřívější společná adresa" }, {
      domexPropertyAddress: {}, domexHouseholdAddress: false,
    })).toEqual({ detail: { address: "Dřívější společná adresa" }, appliedCount: 0 });
  });

  it("doplní rizika NEONu, ale nepřepíše dříve uloženou variantu", () => {
    const result = mergeEmptyNeonDetailFields(
      { version: "Varianta uložená poradcem" },
      {
        version: "Varianta z PDF se nesmí přepsat",
        deathAmount: "100 000",
        waiverInvalidity: true,
      }
    );

    expect(result).toEqual({
      detail: {
        version: "Varianta uložená poradcem",
        deathAmount: 100_000,
        waiverInvalidity: true,
      },
      appliedCount: 2,
    });
  });

  it("doplní strukturovaný detail Slavia Auto bez přepsání uložených hodnot", () => {
    const result = mergeEmptySlaviaAutoDetailFields(
      { liabilityVariant: "Již uložená varianta" },
      {
        liabilityVariant: "Jubileum",
        priceGuarantee3Years: true,
        tiresLimit: "10 000",
        tiresDeductible: 500,
      }
    );

    expect(result).toEqual({
      detail: {
        liabilityVariant: "Již uložená varianta",
        priceGuarantee3Years: true,
        tiresLimit: 10_000,
        tiresDeductible: 500,
      },
      appliedCount: 3,
    });
  });

  it("drží parsery dostupné pro všechny podporované produkty detailu", () => {
    expect(PDF_REIMPORT_PARSERS.allianzAuto).toBeTypeOf("function");
    expect(PDF_REIMPORT_PARSERS.cppAuto).toBeTypeOf("function");
    expect(PDF_REIMPORT_PARSERS.domex).toBeTypeOf("function");
    expect(PDF_REIMPORT_PARSERS.neon).toBeTypeOf("function");
    expect(PDF_REIMPORT_PARSERS.maxdomov).toBeTypeOf("function");
    expect(PDF_REIMPORT_PARSERS.koopcestovko).toBeTypeOf("function");
  });
});
