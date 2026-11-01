import { describe, expect, it } from "vitest";
import { generateCashflow } from "./generator";
import { computeCashflow, type CashflowSnapshot } from "./computeCashflow";
import { groupItemsByMonth } from "./helpers";
import type { EntryDoc } from "./types";

const owner = "adviser@example.test";
const viewer = "manager@example.test";
const asOf = new Date(2024, 0, 1);
const root: EntryDoc = {
  id: "root", userEmail: owner, entryType: "contract", productKey: "neon",
  contractNumber: "TEST-1", frequencyRaw: "monthly", inputAmount: 2000,
  policyStartDate: "2022-02-01", contractSignedDate: "2022-01-15", durationYears: 10,
  items: [
    { title: "Provize A101", code: "A101", amount: 1000 },
    { title: "Provize po 3 letech", code: "B3601", amount: 300 },
    { title: "Provize po 4 letech", code: "B4801", amount: 400 },
    { title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 100 },
  ],
};
const decrease: EntryDoc = {
  id: "decrease", userEmail: owner, entryType: "endorsement", productKey: "neon",
  rootContractEntryId: "root", parentContractEntryId: "root",
  policyStartDate: "2024-02-01", contractSignedDate: "2024-01-15",
  previousInputAmount: 2000, newInputAmount: 1500, premiumDelta: -500,
  items: [{ title: "Provize A101", code: "A101", amount: -120 }],
};
const generate = (entry: EntryDoc = root, changes: EntryDoc[] = [decrease]) =>
  generateCashflow([entry, ...changes], 10, owner, asOf);

describe("endorsement-adjusted cashflow", () => {
  it("reduces future commissions from the effective period and retains dates, rates and past entitlements", () => {
    const baseline = generate(root, []);
    const rows = generate().filter(item => item.entryId === root.id);
    expect(rows.map(item => item.date)).toEqual(baseline.map(item => item.date));
    expect(rows.find(item => item.commissionCode === "A101")?.amount).toBe(1000);
    expect(rows.find(item => item.commissionCode === "B3601")).toMatchObject({
      amount: 225, commissionPeriodStart: "2025-02-01",
      premiumChangeOriginalAmount: 300, premiumChangeEffectiveDate: "2024-02-01",
      premiumChangeEntryId: "decrease",
    });
    expect(rows.find(item => item.commissionCode === "B4801")?.amount).toBe(300);
    expect(rows.filter(item => item.commissionCode === "B101-B104").map(item => item.amount)).toEqual([100, 75, 75, 75]);
    expect(generate().find(item => item.entryId === decrease.id)?.amount).toBe(-120);
    expect(root.items?.[1].amount).toBe(300);
  });

  it("uses entitlement dates for a delayed payout, retaining actual amount and statement provenance", () => {
    const paid = { ...root, commissionPayouts: [{ key: "actual", code: "B3601", status: "paid",
      amount: 300, expectedAmount: 300, payoutMonthKey: "2026-06", statementNumber: "SYNTHETIC" }] };
    const rows = generate(paid).filter(item => item.commissionCode === "B3601");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 300, payoutStatus: "paid", predictedAmount: 300,
      commissionPayoutKey: "actual", commissionStatementNumber: "SYNTHETIC", commissionPeriodStart: "2025-02-01" });
    expect(rows[0].date).toEqual(new Date(2026, 5, 25));
    expect(rows[0].premiumChangeOriginalAmount).toBeUndefined();
  });

  it("keeps partial actuals and forecasts only the reduced balance for an unambiguous commission period", () => {
    const partial = { ...root, commissionPayouts: [
      { key: "part-1", code: "B3601", status: "difference", amount: 100, payoutMonthKey: "2025-03" },
      { key: "part-2", code: "B3601", status: "difference", amount: 50, payoutMonthKey: "2025-04" },
    ] };
    const rows = generate(partial).filter(item => item.commissionCode === "B3601");
    expect(rows.filter(item => item.payoutStatus === "paid").map(item => item.amount)).toEqual([100, 50]);
    expect(rows.filter(item => item.payoutStatus === "predicted")).toEqual([expect.objectContaining({
      amount: 75, premiumChangeOriginalAmount: 150, premiumChangeEffectiveDate: "2024-02-01",
    })]);
    expect(rows.reduce((sum, item) => sum + item.amount, 0)).toBe(225);
    expect(groupItemsByMonth(rows).reduce((sum, month) => sum + month.predictedTotal, 0)).toBe(225);
  });

  it("does not reduce an unpaid old period simply because its expected payment is after the amendment", () => {
    const quarterly: EntryDoc = { ...root, productKey: "cppPPRbez", frequencyRaw: "quarterly",
      policyStartDate: "2026-01-17", items: [{ title: "Okamžitá provize (z platby)", code: "A101", amount: 100 }] };
    const change: EntryDoc = { ...decrease, productKey: "cppPPRbez", policyStartDate: "2026-07-17", newInputAmount: 1000,
      premiumDelta: -1000, items: [] };
    const rows = generateCashflow([quarterly, change], 2, owner, new Date(2026, 0, 1));
    expect(rows.filter(item => /^A10/.test(item.commissionCode ?? "")).map(item => item.amount)).toEqual([100, 100, 50, 50]);
    expect(rows.find(item => item.commissionCode === "A102")?.commissionPeriodStart).toBe("2026-04-17");
    expect(rows.find(item => item.commissionCode === "A103")?.commissionPeriodStart).toBe("2026-07-17");
  });

  it("never applies a different owner's amendment or their payments", () => {
    const foreign = { ...decrease, userEmail: "other@example.test" };
    const entry = { ...root, commissionPayouts: [{ key: "foreign", code: "B3601", status: "paid",
      amount: 9000, writtenBy: "other@example.test", payoutMonthKey: "2025-03" }] };
    expect(generate(entry, [foreign]).find(item => item.commissionCode === "B3601")?.amount).toBe(300);
  });

  it("applies subsequent decreases to older positive increase tranches without double counting the premium", () => {
    const increase: EntryDoc = { ...decrease, id: "increase", parentContractEntryId: "decrease", policyStartDate: "2025-02-01",
      previousInputAmount: 1500, newInputAmount: 1800, premiumDelta: 300,
      items: [{ title: "Provize po 3 letech", code: "B3601", amount: 60 }] };
    const later: EntryDoc = { ...decrease, id: "later", parentContractEntryId: "increase", policyStartDate: "2026-02-01",
      previousInputAmount: 1800, newInputAmount: 900, premiumDelta: -900, items: [] };
    const rows = generate(root, [decrease, increase, later]);
    expect(rows.find(item => item.entryId === root.id && item.commissionCode === "B4801")?.amount).toBe(150);
    expect(rows.find(item => item.entryId === increase.id && item.commissionCode === "B3601")?.amount).toBe(30);
  });

  it("uses the full authorized timeline for a manager even when a decrease has no override items", () => {
    const managed: EntryDoc = { ...root, managerOverrides: [{ email: viewer, position: "manazer8", commissionMode: "standard",
      total: 60, items: [{ title: "Provize po 3 letech", code: "B3601", amount: 60 }] }] };
    const noCommissionDecrease = { ...decrease, items: [], managerOverrides: [] };
    const snapshot: CashflowSnapshot = { email: viewer, myPosition: "manazer8", myCommissionMode: "standard", hasAnyTeam: true,
      ownEntries: [], teamEntriesRaw: [managed, noCommissionDecrease], tipPayouts: [], subscriptionPayments: [] };
    const rows = computeCashflow(snapshot, { scopeFilter: "team", productFilter: "life", asOf });
    expect(rows.find(item => item.entryId === root.id && item.commissionCode === "B3601")).toMatchObject({
      amount: 45, source: "manager", premiumChangeOriginalAmount: 60,
    });
    expect(rows.some(item => item.entryId === decrease.id)).toBe(false);
  });
});
