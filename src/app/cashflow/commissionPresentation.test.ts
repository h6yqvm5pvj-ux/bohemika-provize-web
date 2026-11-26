import { describe, expect, it } from "vitest";
import type { CashflowItem } from "./types";
import { commissionLabelForItem, commissionMeaning, nonLifeCommissionDetail } from "./commissionPresentation";

const item = (overrides: Partial<CashflowItem> = {}): CashflowItem => ({
  id: "domex-installment",
  date: new Date(2026, 10, 25),
  amount: 100,
  productKey: "domex",
  ownerEmail: "advisor@example.test",
  entryId: "domex-contract",
  note: "Vlastní · DOMEX, každých 12 měsíců",
  policyStartDate: new Date(2025, 6, 31),
  ...overrides,
});

describe("non-life commission period presentation", () => {
  it("labels a shifted payment for the first anniversary period as subsequent", () => {
    expect(nonLifeCommissionDetail(item({
      commissionCode: "B101",
      commissionLabel: "Provize B101",
      commissionPeriodStart: "2026-07-31",
      originalDate: new Date(2026, 7, 25),
      payoutStatus: "shifted",
    }))).toMatchObject({ commissionTypeLabel: "Následná provize" });
  });

  it("keeps a first-year period as acquisition even when its payout arrives late", () => {
    expect(nonLifeCommissionDetail(item({
      commissionCode: "A102",
      commissionLabel: "Provize A102",
      commissionPeriodStart: "2026-06-30",
      originalDate: new Date(2026, 9, 25),
      payoutStatus: "shifted",
    }))).toMatchObject({ commissionTypeLabel: "Vzniková provize" });
  });
});

describe("cashflow commission labels", () => {
  it.each([
    ["Následná provize", "B101", "Následná provize (B101)"],
    ["Následná provize", "B102", "Následná provize (B102)"],
    ["Provize po 3 letech", "B3601", "Provize po 3 letech (B3601)"],
    ["Následná provize B101", "B101", "Následná provize B101"],
    ["Následná provize (B101-B102)", "B101", "Následná provize (B101-B102) (B101)"],
  ])("shows the exact commission code in %s", (commissionLabel, commissionCode, expected) => {
    expect(commissionLabelForItem(item({ commissionLabel, commissionCode }))).toBe(expected);
  });
});

describe("deferred increase explanations", () => {
  it.each([["NB3601", 3], ["NB4801", 4]] as const)("explains %s as a deferred increase", (code, years) => {
    const label = `Provize za navýšení po ${years} letech (${code})`;
    expect(commissionMeaning(label, false, false)).toMatchObject({
      title: `Provize za navýšení po ${years} letech`, text: expect.stringContaining("odložená provize navýšení"),
    });
    expect(commissionMeaning(label, false, false).text).not.toContain("zrychleném režimu");
  });
});
