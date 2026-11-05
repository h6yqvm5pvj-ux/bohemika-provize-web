import { describe, expect, it, vi } from "vitest";

import type { ContractDoc } from "./contractDetailTypes";
import {
  buildContractDetailsSavePlan,
  saveContractDetails,
  type ContractDetailsApiRequest,
  type ContractDetailsForm,
} from "./useContractDetails";

const BOOLEAN_FORM_FIELDS = new Set([
  "editCarAddonAnimalCollision",
  "editCarAddonAnimalDamage",
  "editCarAddonEso",
  "editCarAddonFireExplosion",
  "editCarAddonGap",
  "editCarAddonGlass",
  "editCarAddonKeyLossTheft",
  "editCarAddonKlika",
  "editCarAddonLegalAdvice",
  "editCarAddonLuggage",
  "editCarAddonNatural",
  "editCarAddonNaturalRisks",
  "editCarAddonNonFaultAccident",
  "editCarAddonOwnDamage",
  "editCarAddonPassengerInjury",
  "editCarAddonPothole",
  "editCarAddonReplacementCar",
  "editCarAddonServisPro",
  "editCarAddonSmartGap",
  "editCarAddonTheft",
  "editCarAddonTransportedGoods",
  "editCarAddonVandalism",
  "editCarHullRiskAccident",
  "editCarHullRiskAnimalCollision",
  "editCarHullRiskNatural",
  "editCarHullRiskTheft",
  "editCarHullRiskVandalism",
  "editDomexAssistancePlus",
  "editDomexLiabilityLandlord",
  "editDomexLiabilityMobile",
  "editDomexLiabilityTenant",
  "editFlexiAddonMajakBasic",
  "editFlexiAddonMajakPlus",
  "editFlexiAddonTravel",
  "editNeonCppHelp",
  "editNeonInvalidityPension",
  "editNeonTravelInsurance",
  "editNeonWaiverInvalidity",
  "editNeonWaiverUnemployment",
  "editNeonWorkIncapacity2Illness",
  "editNeonWorkIncapacity2Injury",
  "editNeonWorkIncapacityIllness",
  "editNeonWorkIncapacityInjury",
]);

const form = (overrides: Partial<ContractDetailsForm> = {}): ContractDetailsForm =>
  new Proxy(overrides, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key as keyof ContractDetailsForm];
      return BOOLEAN_FORM_FIELDS.has(key) ? false : "";
    },
  }) as ContractDetailsForm;

const buildPlan = (
  product: "allianzAuto" | "neon" | "flexi" | "maxdomov" | "domex" | "domexneuron",
  overrides: Partial<ContractDetailsForm> = {},
  showDurationForProduct = false
) =>
  buildContractDetailsSavePlan({
    product,
    form: form(overrides),
    durationBounds: [1, 5],
    showDurationForProduct,
  });

describe("useContractDetails", () => {
  it("saves Neuron addresses and assistance independently without adding them to other products", () => {
    const details = {
      editDomexPropertyAddress: " Testovací 10, Město A ",
      editDomexHouseholdAddress: " Ukázková 20, Město B ",
      editDomexPropertyAssistance: "basic", editDomexHouseholdAssistance: "plus",
      editDomexSumInsured: "5 200 000", editDomexHouseholdSumInsured: "850 000",
    };
    const plan = buildPlan("domexneuron", details);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.updates.domexDetail).toMatchObject({
      address: "Testovací 10, Město A", propertyAddress: "Testovací 10, Město A", householdAddress: "Ukázková 20, Město B",
      propertyAssistance: "basic", householdAssistance: "plus", sumInsured: 5_200_000, householdSumInsured: 850_000,
    });
    expect(plan.applyToContract({ id: "neuron-1" } as ContractDoc).domexDetail).toMatchObject({ propertyAssistance: "basic", householdAssistance: "plus" });
    const legacy = buildPlan("maxdomov", details);
    expect(legacy.ok && legacy.updates.maxdomovDetail).not.toHaveProperty("propertyAddress");
    expect(legacy.ok && legacy.updates.maxdomovDetail).not.toHaveProperty("householdAssistance");
  });

  it.each([true, false, null])("preserves the explicit Neuron premium indexation setting %s", value => {
    const plan = buildPlan("domexneuron", { editPremiumIndexationEnabled: value });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.updates.premiumIndexationEnabled).toBe(value);
    expect(plan.applyToContract({ id: "neuron-1" } as ContractDoc).premiumIndexationEnabled).toBe(value);
    const otherProduct = buildPlan("domex", { editPremiumIndexationEnabled: value });
    expect(otherProduct.ok && otherProduct.updates).not.toHaveProperty("premiumIndexationEnabled");
  });

  it("separates the renewable term boundary from actual maturity", () => {
    const plan = buildPlan("domexneuron", { editAutomaticRenewal: true, editPolicyEnd: "2027-11-04" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.updates).toMatchObject({ automaticRenewal: true, policyTermEndDate: new Date("2027-11-04"), policyEndDate: null });
    const finite = buildPlan("domexneuron", { editAutomaticRenewal: false, editPolicyEnd: "2027-11-04" });
    expect(finite.ok && finite.updates.policyEndDate).toEqual(new Date("2027-11-04"));
    expect(buildPlan("domexneuron", { editAutomaticRenewal: false })).toMatchObject({ ok: false });
  });

  it("does not infer a Neuron maturity when saving edits with unknown renewal", async () => {
    const requests: RequestInit[] = [];
    const requestContractsApi: ContractDetailsApiRequest = async <T>(_path: string, init?: RequestInit) => {
      if (init) requests.push(init);
      return { ok: true } as T;
    };
    const result = await saveContractDetails({
      product: "domexneuron", durationBounds: null, showDurationForProduct: false,
      ownerEmail: "advisor@example.test", entryId: "neuron-1", requestContractsApi,
      form: form({ editClientName: "Upravené jméno", editAutomaticRenewal: null, editPolicyEnd: "2027-11-04" }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = JSON.parse(requests[0].body as string);
    expect(body.updates).toMatchObject({ automaticRenewal: null, policyTermEndDate: "2027-11-04T00:00:00.000Z" });
    expect(body.updates).not.toHaveProperty("policyEndDate");
    expect(result.applyToContract({ id: "neuron-1", policyEndDate: null } as ContractDoc)).toMatchObject({ policyEndDate: null });
    expect(result.applyToContract({ id: "neuron-1", policyEndDate: "2028-11-04" } as ContractDoc)).toMatchObject({ policyEndDate: "2028-11-04" });
  });

  it("zachová výpočet a lokální aktualizaci pro auto", () => {
    const plan = buildPlan(
      "allianzAuto",
      {
        editClientName: "  Petra Nováková  ",
        editContractNumber: " 2026-001 ",
        editDuration: 8.9,
        editCarMake: "  Škoda ",
        editCarAnnualMileage: " 15 000 ",
        editCarAllianzScope: " Komplet ",
        editCarHullSumInsured: "neomezeno",
        editCarHullDeductible: "5 000",
        editCarAddonGlass: true,
        editCarAddonGlassLimit: "10 000",
      },
      true
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.updates).toMatchObject({
      clientName: "Petra Nováková",
      contractNumber: "2026-001",
      durationYears: 5,
      carMake: "Škoda",
      carAnnualMileage: "15 000",
      carAllianzScope: "Komplet",
      carHullSumInsured: null,
      carHullSumInsuredText: "neomezeno",
      carHullDeductible: 5000,
      carHullDeductibleText: "5 000",
      carAddonGlass: true,
      carAddonGlassLimit: 10000,
    });
    expect(plan.applyToContract({ id: "1", durationYears: 3 } as ContractDoc)).toMatchObject({
      clientName: "Petra Nováková",
      durationYears: 5,
      carMake: "Škoda",
    });
  });

  it("sestaví stejná rizika NEONu a vyčistí auto pole", () => {
    const plan = buildPlan("neon", {
      editNeonVersion: "  Exclusive ",
      editNeonDeathAmount: "1 500 000",
      editNeonWaiverInvalidity: true,
      editNeonWorkIncapacity2Injury: true,
      editNeonLiabilityCitizenLimit: "10 000 000",
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.updates).toMatchObject({
      carMake: null,
      neonDetail: expect.objectContaining({
        version: "Exclusive",
        deathAmount: 1_500_000,
        waiverInvalidity: true,
        workIncapacity2Injury: true,
        liabilityCitizenLimit: 10_000_000,
        neonPdfRisks: null,
      }),
      flexiDetail: null,
    });
  });

  it("sestaví údaje Flexi a majetkové údaje pouze pro správný produkt", () => {
    const flexiPlan = buildPlan("flexi", {
      editFlexiDeathAmount: "250 000",
      editFlexiDeathTypedType: "Úraz",
      editFlexiAddonMajakPlus: true,
    });
    const propertyPlan = buildPlan("maxdomov", {
      editDomexAddress: " Hlavní 1 ",
      editDomexSumInsured: "4 200 000",
      editDomexLiabilityMobile: true,
    });

    expect(flexiPlan.ok).toBe(true);
    expect(propertyPlan.ok).toBe(true);
    if (!flexiPlan.ok || !propertyPlan.ok) return;

    expect(flexiPlan.updates).toMatchObject({
      flexiDetail: expect.objectContaining({
        deathAmount: 250_000,
        deathTypedType: "Úraz",
        addonMajakPlus: true,
      }),
      domexDetail: null,
      maxdomovDetail: null,
    });
    expect(propertyPlan.updates).toMatchObject({
      domexDetail: null,
      maxdomovDetail: expect.objectContaining({
        address: "Hlavní 1",
        sumInsured: 4_200_000,
        liabilityMobile: true,
      }),
      flexiDetail: null,
    });
  });

  it("zastaví uložení, pokud konec pojištění předchází počátku", async () => {
    const requestContractsApi = vi.fn();
    const result = await saveContractDetails({
      product: "domex",
      form: form({
        editPolicyStart: "2026-06-10",
        editPolicyEnd: "2026-06-09",
      }),
      durationBounds: null,
      showDurationForProduct: false,
      ownerEmail: "poradce@example.cz",
      entryId: "contract-1",
      requestContractsApi,
    });

    expect(result).toEqual({
      ok: false,
      error: "Datum „Pojištění do“ nesmí být před datem počátku.",
    });
    expect(requestContractsApi).not.toHaveBeenCalled();
  });

  it("odešle do stejného endpointu úplný plán změn", async () => {
    const requestCalls: [string, RequestInit | undefined][] = [];
    const requestContractsApi: ContractDetailsApiRequest = async <T>(
      path: string,
      init?: RequestInit
    ) => {
      requestCalls.push([path, init]);
      return { ok: true } as T;
    };
    const result = await saveContractDetails({
      product: "domex",
      form: form({ editClientName: "Alena", editDomexAddress: "Náměstí 5" }),
      durationBounds: null,
      showDurationForProduct: false,
      ownerEmail: "poradce@example.cz",
      entryId: "contract-1",
      requestContractsApi,
    });

    expect(result.ok).toBe(true);
    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.[0]).toBe("/api/contracts/update-fields");
    expect(requestCalls[0]?.[1]).toEqual(expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse((requestCalls[0]?.[1]?.body as string) ?? "{}")).toMatchObject({
      ownerEmail: "poradce@example.cz",
      entryId: "contract-1",
      updates: expect.objectContaining({
        clientName: "Alena",
        domexDetail: expect.objectContaining({ address: "Náměstí 5" }),
      }),
    });
  });
});
