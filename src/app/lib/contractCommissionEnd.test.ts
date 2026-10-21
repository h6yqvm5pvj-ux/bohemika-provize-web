import { describe, expect, it } from "vitest";
import { generateCashflow } from "../cashflow/generator";
import type { EntryDoc } from "../cashflow/types";
import { contractCommissionEndDate, isContractCommissionEnded } from "./contractCommissionEnd";

const historical = { productKey: "domex", contractSignedDate: "2020-09-01", policyStartDate: "2020-10-01" };

describe("historical DOMEX commission end", () => {
  it("ends at the cashflow cutoff after the first year and four subsequent years, in Prague time", () => {
    const end = contractCommissionEndDate(historical)!;
    expect(end.toISOString()).toBe("2025-11-25T00:00:00.000+01:00");
    expect(isContractCommissionEnded(historical, new Date(end.getTime() - 1))).toBe(false);
    expect(isContractCommissionEnded(historical, end)).toBe(true);
    expect(isContractCommissionEnded(historical, new Date("2030-01-01"))).toBe(true);
  });

  it.each(["2017-06-01", "2023-06-01", "2024-08-31"])("includes historical signing date %s", contractSignedDate => {
    expect(contractCommissionEndDate({ ...historical, contractSignedDate })).not.toBeNull();
  });

  it.each([
    { productKey: "domexneuron" }, { productKey: "cppbytex" }, { productKey: null },
    { contractSignedDate: "2017-05-31" }, { contractSignedDate: "2024-09-01" },
    { contractSignedDate: null }, { contractSignedDate: "invalid" },
    { policyStartDate: null }, { policyStartDate: "invalid" }, { policyStartDate: new Date(NaN) },
  ])("avoids a false warning for %j", patch => {
    expect(contractCommissionEndDate({ ...historical, ...patch })).toBeNull();
    expect(isContractCommissionEnded({ ...historical, ...patch }, new Date("2040-01-01"))).toBe(false);
  });

  it("honors the subsequent-period cutoff day and Firestore date shapes", () => {
    const start = new Date("2020-10-26T00:00:00+01:00");
    expect(contractCommissionEndDate({ ...historical, policyStartDate: { seconds: start.getTime() / 1000 } })?.toISOString())
      .toBe("2025-12-25T00:00:00.000+01:00");
    expect(contractCommissionEndDate({ ...historical, policyStartDate: "26. 10. 2020" })?.toISOString())
      .toBe("2025-12-25T00:00:00.000+01:00");
  });

  it.each([undefined, "inherited"])("handles a leap-day start using cashflow anniversary rules (%s)", acquisitionType => {
    // Ordinary anniversaries roll to March 1; inherited anniversaries clamp to February 28.
    const contract = { ...historical, policyStartDate: "2020-02-29", acquisitionType };
    expect(contractCommissionEndDate(contract)?.toISOString()).toBe("2025-04-25T00:00:00.000+02:00");
  });

  it.each(["annual", "semiannual", "quarterly", "monthly"] as const)("matches the last allowed cashflow window for %s payments", frequencyRaw => {
    const contract: EntryDoc = { ...historical, id: "synthetic-domex", productKey: "domex", frequencyRaw,
      items: [{ title: "Okamžitá provize", amount: 100 }, { title: "Následná provize (z platby)", amount: 10 }] };
    const rows = generateCashflow([contract], 10, undefined, new Date("2020-09-01T12:00:00Z"));
    const subsequent = rows.filter(row => row.amount === 10);
    expect(subsequent).toHaveLength({ annual: 4, semiannual: 8, quarterly: 16, monthly: 48 }[frequencyRaw]);
    const end = contractCommissionEndDate(contract)!;
    expect(subsequent.every(row => row.date < end)).toBe(true);
    expect(isContractCommissionEnded(contract, end)).toBe(true);
  });
});
