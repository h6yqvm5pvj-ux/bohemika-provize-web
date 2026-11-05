import { describe, expect, it } from "vitest";
import { calculatorReplacementCommissionMetadata, calculatorReplacementPayload } from "./calculatorReplacementPayload";

const replacement = {
  product: "domexneuron" as const,
  active: true,
  originalMissingInSystem: true,
  originalContractNumber: " 0020000077 ",
};

describe("calculator replacement payload", () => {
  it("keeps the DOMEX Neuron original number as information when explicitly unlinked", () => {
    expect(calculatorReplacementPayload(replacement)).toEqual({
      isRefresh: true,
      refreshOriginalMissingInSystem: true,
      refreshOriginalContractNumber: "0020000077",
      requiresStatementRefresh: false,
      commissionCalculationStatus: null,
      commissionBaseSource: null,
    });
  });

  it("allows an explicitly unlinked DOMEX Neuron replacement without an original number", () => {
    expect(calculatorReplacementPayload({ ...replacement, originalContractNumber: " " })).toMatchObject({
      isRefresh: true, refreshOriginalMissingInSystem: true, refreshOriginalContractNumber: null,
    });
  });

  it("retains normal original-contract linking when the missing-original option is off", () => {
    expect(calculatorReplacementPayload({ ...replacement, originalMissingInSystem: false })).toMatchObject({
      refreshOriginalMissingInSystem: false, refreshOriginalContractNumber: "0020000077",
    });
  });

  it("preserves the existing NEON missing-original behavior", () => {
    expect(calculatorReplacementPayload({ ...replacement, product: "neon" })).toMatchObject({
      refreshOriginalMissingInSystem: true, refreshOriginalContractNumber: null,
      requiresStatementRefresh: true,
      commissionCalculationStatus: "provisional_refresh_missing_original",
      commissionBaseSource: "calculator_provisional",
    });
  });

  it.each(["domex", "cppAuto", "allianzAuto", "flexi"] as const)("preserves the existing %s manual-save behavior", (product) => {
    expect(calculatorReplacementPayload({ ...replacement, product })).toMatchObject({
      refreshOriginalMissingInSystem: false, refreshOriginalContractNumber: "0020000077",
    });
  });

  it("does not submit stale replacement fields after the workflow is disabled", () => {
    expect(calculatorReplacementPayload({ ...replacement, active: false })).toEqual({
      isRefresh: false, refreshOriginalMissingInSystem: false, refreshOriginalContractNumber: null,
      requiresStatementRefresh: false, commissionCalculationStatus: null, commissionBaseSource: null,
    });
  });

  it.each([false, true])("keeps a DOMEX Neuron batch commission final regardless of original availability (%s)", (missingOriginal) => {
    expect(calculatorReplacementCommissionMetadata("domexneuron", missingOriginal)).toEqual({
      requiresStatementRefresh: false, commissionCalculationStatus: null, commissionBaseSource: null,
    });
  });

  it.each(["neon", "domex", "cppAuto", "allianzAuto", "flexi"] as const)("preserves existing %s batch metadata for a missing original", (product) => {
    expect(calculatorReplacementCommissionMetadata(product, true)).toEqual({
      requiresStatementRefresh: true,
      commissionCalculationStatus: "provisional_refresh_missing_original",
      commissionBaseSource: "calculator_provisional",
    });
  });
});
