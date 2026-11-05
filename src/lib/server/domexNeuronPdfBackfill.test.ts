import { describe, expect, it } from "vitest";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import type { DomexPdfResult } from "@/app/lib/parseDomexPdf";
import { planDomexNeuronPdfBackfill } from "./domexNeuronPdfBackfill";

const current = (patch: Partial<ContractDoc> = {}): ContractDoc => ({
  productKey: "domexneuron", entryType: "contract", clientName: "Mgr. Jana Testovací", contractNumber: "0090000088",
  contractSignedDate: new Date("2026-11-04"), policyStartDate: new Date("2026-11-05"), status: "active", stornoDate: null,
  inputAmount: 2400, calculationInputAmount: 2400, effectiveInputAmount: 2520,
  total: 120, items: [{ title: "Původní provize", code: "A101", amount: 120 }],
  isRefresh: true, refreshOriginalContractNumber: "0020000088", ...patch,
});
const parsed = (patch: Partial<DomexPdfResult> = {}): DomexPdfResult => ({
  clientName: "Jana Testovací", contractNumber: "009 000 0088", contractSignedDate: "2026-11-04", policyStartDate: "2026-11-05",
  automaticRenewal: true, premiumIndexationEnabled: false, policyTermEndDate: "2027-11-04", policyEndDate: null,
  domexPropertyAddress: "Syntetická stavba 10, Testov", domexPropertyType: "dum", domexPropertyCoverage: "opti",
  domexPropertySumInsured: 4_000_000, domexPropertyAssistance: "basic",
  domexHouseholdAddress: "Modelová domácnost 20, Testov", domexHouseholdType: "trvale", domexHouseholdCoverage: "maxi",
  domexHouseholdSumInsured: 500_000, domexHouseholdAssistance: "plus", domexLiabilitySumInsured: 20_000_000,
  amount: 9999, isRefresh: false, refreshOriginalContractNumber: "FORBIDDEN", ...patch,
});

describe("additive DOMEX Neuron PDF backfill plan", () => {
  it("matches exact policy/client identity and fills only missing validated data", () => {
    const source = current(), pdf = parsed();
    const sourceBefore = structuredClone(source), pdfBefore = structuredClone(pdf);
    const plan = planDomexNeuronPdfBackfill(source, pdf);
    expect(plan.status).toBe("ready");
    if (plan.status === "rejected") return;
    expect(plan.patch).toEqual({ automaticRenewal: true, premiumIndexationEnabled: false,
      policyTermEndDate: new Date("2027-11-04"), domexDetail: {
        propertyAddress: "Syntetická stavba 10, Testov", propertyType: "dum", propertyCoverage: "opti", sumInsured: 4_000_000,
        propertyAssistance: "basic", householdAddress: "Modelová domácnost 20, Testov", householdType: "trvale",
        householdCoverage: "maxi", householdSumInsured: 500_000, householdAssistance: "plus", liabilitySumInsured: 20_000_000,
      } });
    expect(plan.conflictKeys).toEqual([]);
    for (const key of ["inputAmount", "effectiveInputAmount", "calculationInputAmount", "amount", "total", "items", "status", "isRefresh", "refreshOriginalContractNumber", "clientName", "contractNumber"]) {
      expect(plan.patch).not.toHaveProperty(key);
    }
    expect(source).toEqual(sourceBefore); expect(pdf).toEqual(pdfBefore);
  });

  it.each([undefined, null])("allows a legacy missing entry type (%s)", entryType => {
    expect(planDomexNeuronPdfBackfill(current({ entryType }), parsed()).status).toBe("ready");
  });

  it.each([{ productKey: "domex" }, { productKey: "cppAuto" }, { entryType: "endorsement" }, { entryType: "" }])("rejects unsupported records: %j", patch => {
    expect(planDomexNeuronPdfBackfill(current(patch as Partial<ContractDoc>), parsed())).toEqual({ status: "rejected", reason: "unsupported-contract", conflictKeys: [] });
  });

  it.each([
    { contractNumber: "90000088" }, { contractNumber: "0090000099" }, { contractNumber: "" },
    { clientName: "Jana Testovaci" }, { clientName: "Testovací Jana" }, { clientName: "Jiný Klient" }, { clientName: "" },
  ])("never uses loose/fuzzy identity matching: %j", patch => {
    expect(planDomexNeuronPdfBackfill(current(), parsed(patch))).toMatchObject({ status: "rejected", reason: "identity-mismatch" });
  });

  it("preserves every known manual detail value and reports conflicts without values", () => {
    const source = current({ automaticRenewal: false, premiumIndexationEnabled: true,
      policyEndDate: new Date("2027-11-04"), policyTermEndDate: new Date("2027-11-04"),
      domexDetail: { propertyAddress: "Ruční adresa 1", propertyAssistance: "plus", sumInsured: 3_000_000, note: "Ruční poznámka" } });
    const plan = planDomexNeuronPdfBackfill(source, parsed());
    expect(plan.status).toBe("ready");
    if (plan.status === "rejected") return;
    expect(plan.conflictKeys).toEqual(["automaticRenewal", "domexDetail.propertyAddress", "domexDetail.propertyAssistance", "domexDetail.sumInsured", "premiumIndexationEnabled"]);
    expect(plan.patch.domexDetail).toMatchObject(source.domexDetail!);
    expect(plan.patch).not.toHaveProperty("automaticRenewal");
    expect(plan.patch).not.toHaveProperty("premiumIndexationEnabled");
    expect(JSON.stringify(plan.conflictKeys)).not.toContain("Ruční");
    expect(JSON.stringify(plan.conflictKeys)).not.toContain("3000000");
  });

  it("does not clear known maturity to enable renewal", () => {
    const plan = planDomexNeuronPdfBackfill(current({ policyEndDate: new Date("2027-11-04") }), parsed());
    expect(plan.status).toBe("ready");
    if (plan.status === "rejected") return;
    expect(plan.patch).not.toHaveProperty("policyEndDate");
    expect(plan.patch).not.toHaveProperty("automaticRenewal");
    expect(plan.conflictKeys).toContain("automaticRenewal");
  });

  it("fills missing core dates and fixed maturity only as one valid term", () => {
    const plan = planDomexNeuronPdfBackfill(current({ contractSignedDate: null, policyStartDate: null }), parsed({ automaticRenewal: false, policyEndDate: "2027-11-04" }));
    expect(plan.status).toBe("ready");
    if (plan.status === "rejected") return;
    expect(plan.patch).toMatchObject({ contractSignedDate: new Date("2026-11-04"), policyStartDate: new Date("2026-11-05"),
      automaticRenewal: false, policyEndDate: new Date("2027-11-04"), policyTermEndDate: new Date("2027-11-04") });
  });

  it("does not mistake a printed end date for fixed maturity while renewal is unknown", () => {
    const plan = planDomexNeuronPdfBackfill(current(), parsed({ automaticRenewal: null, policyEndDate: "2027-11-04" }));
    expect(plan.status).toBe("ready");
    if (plan.status === "rejected") return;
    expect(plan.patch).not.toHaveProperty("policyEndDate");
    expect(plan.patch).toHaveProperty("policyTermEndDate", new Date("2027-11-04"));
    expect(plan.conflictKeys).toContain("policyEndDate");
  });

  it("is idempotent when the same PDF data has already been added", () => {
    const first = planDomexNeuronPdfBackfill(current(), parsed());
    if (first.status === "rejected") throw new Error("Synthetic fixture rejected");
    const second = planDomexNeuronPdfBackfill({ ...current(), ...first.patch } as ContractDoc, parsed());
    expect(second).toEqual({ status: "unchanged", patch: {}, changedKeys: [], conflictKeys: [] });
  });

  it.each([
    { domexPropertyAssistance: "PLUS" }, { domexHouseholdAssistance: false }, { domexPropertyAddress: {} },
    { domexHouseholdAddress: "Adresa\nJiný řádek" }, { domexPropertyAddress: "X".repeat(201) },
    { domexPropertySumInsured: -1 }, { domexHouseholdSumInsured: "500000" }, { domexLiabilitySumInsured: Number.NaN },
    { domexPropertyCoverage: "unknown" }, { automaticRenewal: "ANO" }, { premiumIndexationEnabled: "NE" },
    { policyTermEndDate: "2027-02-30" }, { contractSignedDate: "not-a-date" },
  ])("fails closed on malformed PDF data even if another field is usable: %j", patch => {
    expect(planDomexNeuronPdfBackfill(current(), parsed(patch as unknown as Partial<DomexPdfResult>)))
      .toMatchObject({ status: "rejected", reason: "invalid-pdf-data" });
  });

  it("validates the fully merged contract before returning any patch", () => {
    const plan = planDomexNeuronPdfBackfill(current({ policyStartDate: new Date("2026-11-03") }), parsed());
    expect(plan).toMatchObject({ status: "rejected", reason: "invalid-merged-contract" });
    expect(plan).not.toHaveProperty("patch");
  });

  it("rejects unrecognized existing detail fields rather than dropping them", () => {
    expect(planDomexNeuronPdfBackfill(current({ domexDetail: { unknown: "existing" } as ContractDoc["domexDetail"] }), parsed()))
      .toMatchObject({ status: "rejected", reason: "invalid-current-data" });
  });

  it("returns a rejected plan rather than throwing on an invalid stored date", () => {
    expect(planDomexNeuronPdfBackfill(current({ contractSignedDate: new Date(Number.NaN) }), parsed()))
      .toMatchObject({ status: "rejected", reason: "invalid-merged-contract" });
  });

  it("does not allow normalized identity to conceal control characters", () => {
    expect(planDomexNeuronPdfBackfill(current(), parsed({ contractNumber: "009000\n0088" })))
      .toMatchObject({ status: "rejected", reason: "identity-mismatch" });
  });
});
