import { describe, expect, it } from "vitest";
import { generateCashflow } from "../cashflow/generator";
import type { EntryDoc } from "../cashflow/types";
import { contractCommissionEndDate, isContractCommissionEnded } from "./contractCommissionEnd";

const historical = { productKey: "domex", contractSignedDate: "2020-09-01", policyStartDate: "2020-10-01" };

describe("historical DOMEX commission end", () => {
  const owner = "advisor@example.test";
  const policy = { productKey: "domex", contractSignedDate: "2022-09-01", policyStartDate: "2022-09-23",
    frequencyRaw: "annual", userEmail: owner };
  const payments = Array.from({ length: 4 }, (_, i) => ({ code: `B${101 + i}`, writtenBy: owner, amount: 200, status: "paid" }));
  const afterLastPeriod = new Date("2026-11-27T12:00:00Z");

  it("marks the annual plan complete after its four renewals, before the calendar cutoff", () => {
    expect(isContractCommissionEnded({ ...policy, commissionPayouts: payments }, afterLastPeriod)).toBe(true);
    expect(isContractCommissionEnded({ ...policy, commissionPayouts: payments }, new Date("2026-09-22T12:00:00Z"))).toBe(false);
    expect(isContractCommissionEnded({ ...policy, contractSignedDate: "2024-09-01", commissionPayouts: payments }, afterLastPeriod)).toBe(false);
  });

  it("keeps the badge off for missing, reversed, disputed or another recipient's installments", () => {
    const firstThree = payments.slice(0, 3);
    const last = payments[3];
    for (const receipts of [firstThree, [...firstThree, firstThree[0]], [...payments, { ...last, amount: -200 }],
      [...firstThree, { ...last, status: "difference" }], [...firstThree, { ...last, writtenBy: "manager@example.test" }]]) {
      expect(isContractCommissionEnded({ ...policy, commissionPayouts: receipts }, afterLastPeriod)).toBe(false);
    }
    expect(isContractCommissionEnded({ ...policy, commissionPayouts: [...payments, { ...last, amount: -200 }, last] }, afterLastPeriod)).toBe(true);
  });

  it("uses the effective payment frequency to identify the last renewal", () => {
    const amended = { ...policy, paymentFrequencyChanges: [{ effectiveDate: "2026-09-23", frequency: "semiannual" as const }] };
    const fifth = { ...payments[3], code: "B105" };
    expect(isContractCommissionEnded({ ...policy, frequencyRaw: "quarterly", commissionPayouts: payments }, afterLastPeriod)).toBe(false);
    expect(isContractCommissionEnded({ ...amended, commissionPayouts: payments }, afterLastPeriod)).toBe(false);
    expect(isContractCommissionEnded({ ...amended, commissionPayouts: [...payments, fifth] }, new Date("2027-04-15"))).toBe(true);
  });

  it("checks only eligible renewals of inherited contracts and requires a known transfer date", () => {
    const inherited = { ...policy, acquisitionType: "inherited", commissionPayouts: payments.slice(2) };
    expect(isContractCommissionEnded({ ...inherited, transferEffectiveDate: "2025-09-01" }, afterLastPeriod)).toBe(true);
    expect(isContractCommissionEnded(inherited, afterLastPeriod)).toBe(false);
  });

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
