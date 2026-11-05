import { describe, expect, it } from "vitest";
import { buildStatementCodeComparisons, isHigherStatementCommission } from "./statementCommissionComparisons";
import { statementContractReview } from "./statementContractReview";
import { domexNeuronStatementBaseIsConfirmed, domexNeuronStatementExpectation, statementDomexNeuronIndexation } from "./statementDomexNeuronIndexation";
import type { CommissionRow, MatchedSystemContract } from "./statementTypes";

const system: MatchedSystemContract = {
  id: "synthetic-neuron", adviserEmail: "synthetic@example.test", productKey: "domexneuron",
  premiumIndexationEnabled: true, frequencyRaw: "annual", inputAmount: 12_000,
  calculationInputAmount: 12_000, position: "poradce1", policyStartDate: "2026-11-05",
  items: [{ code: "B101", title: "Následná provize (z platby)", amount: 333.60 }],
};
const row: CommissionRow = {
  id: "synthetic-row", type: "B101", commission: 350.28, product: "CPP_DOMEX+", base: 12_600,
  contractNumber: "0090000088", client: "Syntetický klient", role: "Z", signedAt: "04.11.2026",
  validFrom: "05.11.2026", career: "1", percent: "", reserveFund: 0, detailUrl: null,
  lifeSplitKind: "unknown", lifeSplitLabel: "",
};
const options = { rows: [row], contract: system, statementPeriod: "01.11.2027 - 30.11.2027", expectedAmount: 333.60 };
const compare = (patch: Partial<typeof options> = {}) => {
  const input = { ...options, ...patch };
  return buildStatementCodeComparisons({ rows: input.rows, keyPrefix: "subsequent",
    expectedForRows: rows => domexNeuronStatementExpectation({ ...input, rows }) });
};

describe("DOMEX Neuron statement indexation review", () => {
  it("accepts an exactly proven anniversary increase and explains the actual new base", () => {
    const expectation = domexNeuronStatementExpectation(options);
    expect(expectation).toMatchObject({ amount: 350.28, acceptHigherCommission: false,
      indexation: { status: "confirmed", annualPremium: 12_600 } });
    expect(expectation.detailLines?.[0]).toContain("Valorizace pojistného:");
    expect(compare()[0]).toMatchObject({ status: "ok", expectedAmount: 350.28, statementAmount: 350.28 });
    expect(domexNeuronStatementBaseIsConfirmed({ ...options, statementBase: row.base })).toBe(true);
  });

  it.each([false, null, undefined])("keeps a higher commission as an error without consent (%s)", premiumIndexationEnabled => {
    const contract = { ...system, premiumIndexationEnabled };
    const comparisons = compare({ contract });
    expect(comparisons[0]).toMatchObject({ expectedAmount: 333.60, status: "diff", acceptHigherCommission: false });
    expect(isHigherStatementCommission(comparisons[0])).toBe(false);
    expect(statementContractReview({ matched: true, unpaired: false, issueCount: 0, hasWarnings: false, comparisons }))
      .toMatchObject({ status: "commission-error", hasCommissionError: true, hasHigherCommission: false });
    expect(domexNeuronStatementBaseIsConfirmed({ ...options, contract, statementBase: row.base })).toBe(false);
  });

  it.each([300, 380])("retains an underpaid or unproven overpaid commission (%s)", commission => {
    const changed = { ...options, rows: [{ ...row, commission }] };
    expect(domexNeuronStatementExpectation(changed)).toMatchObject({ amount: 333.60, indexation: { status: "unproven" } });
    const comparison = compare({ rows: changed.rows })[0];
    expect(comparison.status).toBe("diff");
    expect(isHigherStatementCommission(comparison)).toBe(false);
    expect(domexNeuronStatementBaseIsConfirmed({ ...changed, statementBase: row.base })).toBe(false);
  });

  it("requires a date from the source statement at or after the actual anniversary", () => {
    expect(statementDomexNeuronIndexation({ ...options, statementPeriod: "01.10.2027 - 31.10.2027" }).status).toBe("unproven");
    expect(statementDomexNeuronIndexation({ ...options, statementPeriod: null }).status).toBe("unproven");
  });

  it("does not explain a career mismatch as indexation", () => {
    const input = { ...options, careerMismatch: true };
    expect(domexNeuronStatementExpectation(input)).toMatchObject({ amount: 333.60, indexation: { status: "unproven" } });
    expect(domexNeuronStatementBaseIsConfirmed({ ...input, statementBase: row.base })).toBe(false);
  });

  it("keeps duplicate rows of the same B code unresolved instead of doubling the indexed expectation", () => {
    const rows = [row, { ...row, id: "duplicate" }];
    const comparison = compare({ rows })[0];
    expect(comparison).toMatchObject({ status: "diff", statementAmount: 700.56, expectedAmount: 333.60, acceptHigherCommission: false });
    expect(isHigherStatementCommission(comparison)).toBe(false);
    expect(domexNeuronStatementBaseIsConfirmed({ ...options, rows, statementBase: row.base })).toBe(false);
  });

  it("requires the anniversary installment and independently resolves annual versus payment bases", () => {
    const contract = { ...system, frequencyRaw: "quarterly", inputAmount: 3000, calculationInputAmount: 3000,
      items: [{ code: "B101-B104", title: "Následná provize (z platby)", amount: 83.40 }] };
    for (const base of [12_600, 3150]) {
      const input = { ...options, contract, rows: [{ ...row, base, commission: 87.57 }] };
      expect(statementDomexNeuronIndexation(input)).toMatchObject({ status: "confirmed", annualPremium: 12_600, paymentPremium: 3150 });
      expect(statementDomexNeuronIndexation({ ...input, rows: [{ ...input.rows[0], type: "B102" }] }).status).toBe("unproven");
    }
  });

  it("uses the original stored B rate after a premium update without trusting the current paid amount", () => {
    const contract = { ...system, effectiveInputAmount: 12_600 };
    expect(statementDomexNeuronIndexation({ ...options, contract }).status).toBe("confirmed");
    const trustedItems = [{ code: "B101", title: "Následná provize (z platby)", amount: 120 }];
    expect(statementDomexNeuronIndexation({ ...options, contract, source: "manager", trustedItems,
      rows: [{ ...row, base: 15_000, commission: 150 }] })).toMatchObject({ status: "confirmed", expectedCommission: 150 });
    expect(statementDomexNeuronIndexation({ ...options, source: "manager", trustedItems: [] }).status).toBe("unproven");
    expect(statementDomexNeuronIndexation({ ...options, source: "manager", trustedItems,
      rows: [{ ...row, base: 15_000, commission: 180 }] }).status).toBe("unproven");
    expect(statementDomexNeuronIndexation({ ...options, source: "manager", trustedItems, careerMismatch: true,
      rows: [{ ...row, base: 15_000, commission: 150 }] }).status).toBe("unproven");
  });

  it("requires an unambiguous stored manager coefficient", () => {
    expect(statementDomexNeuronIndexation({ ...options, source: "manager", trustedItems: [
      { code: "B101", title: "Následná provize (z platby)", amount: 120 },
      { code: "B101", title: "Následná provize (z platby)", amount: 140 },
    ] }).status).toBe("unproven");
  });

  it("uses confirmed history for later B installments without importing a future premium into older periods", () => {
    const contract: MatchedSystemContract = {
      ...system, frequencyRaw: "quarterly", inputAmount: 3000, calculationInputAmount: 3000, effectiveInputAmount: 3600,
      items: [{ code: "B101-B104", title: "Následná provize (z platby)", amount: 83.40 }],
      premiumIndexationHistory: [
        { effectiveDate: "2027-11-05", paymentPremium: 3300 },
        { effectiveDate: "2028-11-05", paymentPremium: 3600 },
      ],
    };
    const rows = [{ ...row, type: "B102", base: 13_200, commission: 91.74 }];
    const input = { ...options, contract, rows, statementPeriod: "01.02.2028 - 29.02.2028", expectedAmount: 83.40 };
    expect(domexNeuronStatementExpectation(input)).toMatchObject({ amount: 91.74, indexation: { status: "confirmed", paymentPremium: 3300 } });
    expect(domexNeuronStatementBaseIsConfirmed({ ...input, statementBase: 13_200 })).toBe(true);
    // A later statement can settle an older entitlement code; its original period remains authoritative.
    expect(domexNeuronStatementExpectation({ ...input, statementPeriod: "01.12.2029 - 31.12.2029" }).amount).toBe(91.74);
    expect(domexNeuronStatementExpectation({ ...input, contract: { ...contract, premiumIndexationEnabled: false } }).amount).toBe(91.74);
    expect(domexNeuronStatementExpectation({ ...input, statementPeriod: "01.10.2027 - 31.10.2027" }))
      .toMatchObject({ amount: 83.40, indexation: { status: "unproven" } });
    expect(domexNeuronStatementExpectation({ ...input, rows: [{ ...rows[0], commission: 60 }] }))
      .toMatchObject({ amount: 91.74, indexation: { status: "unproven" } });
    expect(domexNeuronStatementBaseIsConfirmed({ ...input, rows: [rows[0], { ...rows[0], id: "duplicate" }], statementBase: 13_200 })).toBe(false);
  });

  it("does not treat a current effective premium without confirmed history as evidence for later installments", () => {
    const contract = { ...system, frequencyRaw: "quarterly", inputAmount: 3000, calculationInputAmount: 3000, effectiveInputAmount: 3300,
      items: [{ code: "B101-B104", title: "Následná provize (z platby)", amount: 83.40 }] };
    const input = { ...options, contract, rows: [{ ...row, type: "B102", base: 13_200, commission: 91.74 }],
      statementPeriod: "01.02.2028 - 29.02.2028", expectedAmount: 83.40 };
    expect(domexNeuronStatementExpectation(input)).toMatchObject({ amount: 83.40, indexation: { status: "unproven" } });
  });

  it("preserves higher-commission treatment for other products and immediate A payouts", () => {
    const contract = { ...system, productKey: "domex" as const };
    const changedRows = [{ ...row, commission: 380 }];
    const ordinary = compare({ contract, rows: changedRows })[0];
    expect(ordinary.acceptHigherCommission).toBeUndefined();
    expect(isHigherStatementCommission(ordinary)).toBe(true);
    const immediate = compare({ rows: [{ ...changedRows[0], type: "A101" }] })[0];
    expect(immediate.acceptHigherCommission).toBeUndefined();
    expect(isHigherStatementCommission(immediate)).toBe(true);
  });
});
