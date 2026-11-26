import { describe, expect, it } from "vitest";
import { computeCashflow } from "./computeCashflow";
import type { CashflowCommissionStatementSummary, EntryDoc } from "./types";
const owner = "owner@example.test";
const nv = (key: string, month: string) => ({ key, statementId: key, code: "NV101", amount: 100,
  expectedAmount: 100, difference: 0, status: "paid", writtenBy: owner, payoutMonthKey: month });
const n1 = nv("increase-one", "2025-6");
const n2 = nv("increase-two", "2025-10");
const nb = { ...nv("card-one", "2026-6"), code: "NB0301", amount: 25, expectedAmount: 25 };
const items = [{ title: "Provize A101", code: "A101", amount: 100 }, { title: "Provize B0301", code: "B0301", amount: 25 }];
const family: EntryDoc[] = [
  { id: "root", userEmail: owner, contractNumber: "SYNTHETIC", productKey: "neon", entryType: "contract",
    policyStartDate: "2024-01-01", contractSignedDate: "2023-12-01", inputAmount: 1000, items: [], commissionPayouts: [n1, n2, nb] },
  { id: "one", userEmail: owner, contractNumber: "SYNTHETIC", productKey: "neon", entryType: "endorsement", rootContractEntryId: "root",
    parentContractEntryId: "root", policyStartDate: "2025-05-01", contractSignedDate: "2025-04-01", premiumDelta: 100,
    previousInputAmount: 1000, newInputAmount: 1100, inputAmount: 100, items, commissionPayouts: [n1, nb] },
  { id: "two", userEmail: owner, contractNumber: "SYNTHETIC", productKey: "neon", entryType: "endorsement", rootContractEntryId: "root",
    parentContractEntryId: "one", policyStartDate: "2025-09-01", contractSignedDate: "2025-08-01", premiumDelta: 100,
    previousInputAmount: 1100, newInputAmount: 1200, inputAmount: 100, items, commissionPayouts: [n2] },
];
describe("life endorsement receipt reconciliation", () => {
  it("corrects two equal legacy payments assigned to one amendment while keeping their separate payout months", () => {
    const first = nv("first-statement", "2025-6");
    const second = nv("second-statement", "2026-1");
    const entries = family.map((entry, index) => ({ ...entry, contractNumber: "1234567890",
      commissionPayouts: index < 2 ? [first, second] : [] }));
    const statement = (id: string, validFrom: string): CashflowCommissionStatementSummary => ({
      id, fileName: "Test", statementNumber: id, statementDate: null, period: null, advisorNumber: null,
      periodStartMs: null, periodEndMs: null, statementDateMs: null, payoutMonthKey: null,
      paidContractNumbers: [], paidCommissionKeys: [], commissionTotal: 100, payoutTotal: 100,
      otherPaymentsTotal: 0, managerCommissionTotal: 0, createdAtMs: null, updatedAtMs: null,
      lifeIncreaseRows: [{ key: id, contractNumber: "1234567890", productKey: "neon", source: "own",
        code: "NV101", amount: 100, validFrom, signedAt: null, baseAmount: 1200 }],
    });
    const rows = computeCashflow({ email: owner, myPosition: "poradce7", myCommissionMode: "standard", hasAnyTeam: false,
      ownEntries: entries, teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [] }, {
      scopeFilter: "own", productFilter: "all", asOf: new Date(2026, 10, 17),
      statements: [statement(second.statementId, "01.09.2025"), statement(first.statementId, "01.05.2025")],
    });
    expect(rows.filter(row => row.commissionCode === "NV101").map(row => [row.entryId, row.amount, row.date.getFullYear(), row.date.getMonth() + 1]))
      .toEqual([["one", 100, 2025, 6], ["two", 100, 2026, 1]]);
    expect(rows.some(row => row.commissionCode === "A101")).toBe(false);
    expect(entries.map(entry => entry.commissionPayouts.length)).toEqual([2, 2, 0]);
  });

  it("counts each source row once and settles the corresponding acquisition while retaining raw NV/NB codes", () => {
    const before = JSON.stringify(family);
    const rows = computeCashflow({ email: owner, myPosition: "poradce7", myCommissionMode: "standard", hasAnyTeam: false,
      ownEntries: family, teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [] },
    { scopeFilter: "own", productFilter: "all", asOf: new Date(2026, 10, 17) });
    const paid = rows.filter(row => row.payoutStatus === "paid");
    expect(paid.map(row => [row.entryId, row.commissionCode, row.amount])).toEqual([
      ["one", "NV101", 100], ["two", "NV101", 100], ["one", "NB0301", 25],
    ]);
    expect(paid.reduce((sum, row) => sum + row.amount, 0)).toBe(225);
    expect(rows.filter(row => row.payoutStatus !== "paid").map(row => [row.entryId, row.commissionCode, row.amount]))
      .toEqual([["two", "B0301", 25]]);
    expect(JSON.stringify(family)).toBe(before);
  });
});

describe("deferred NB components", () => {
  const deferredItems = [
    { title: "Provize B0301", code: "B0301", amount: 25 },
    { title: "Provize po 3 letech", code: "B3601", amount: 75 },
    { title: "Provize po 4 letech", code: "B4801", amount: 15 },
  ];
  const receipt = (code: string, amount: number, month: string) => ({ key: code, statementId: `source-${code}`,
    code, amount, expectedAmount: amount, difference: 0, status: amount < 0 ? "storno" : "paid", writtenBy: owner, payoutMonthKey: month });
  const compute = (payouts: EntryDoc["commissionPayouts"], endorsement = true) => computeCashflow({
    email: owner, myPosition: "poradce7", myCommissionMode: "standard", hasAnyTeam: false,
    ownEntries: [{ ...family[1], entryType: endorsement ? "endorsement" : "contract", items: deferredItems, commissionPayouts: payouts }],
    teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [],
  }, { scopeFilter: "own", productFilter: "all", asOf: new Date(2029, 7, 1) });

  it("settles deferred installments while leaving the unpaid card commission pending", () => {
    const rows = compute([receipt("NB3601", 75, "2028-6"), receipt("NB4801", 15, "2029-6")]);
    expect(rows.filter(row => row.payoutStatus === "paid").map(row => [row.commissionCode, row.amount, row.commissionPeriodStart]))
      .toEqual([["NB3601", 75, "2028-05-01"], ["NB4801", 15, "2029-05-01"]]);
    expect(rows.filter(row => row.payoutStatus !== "paid").map(row => [row.commissionCode, row.amount])).toEqual([["B0301", 25]]);
    expect(rows.find(row => row.commissionCode === "NB3601")?.commissionLabel).toBe("Provize za navýšení po 3 letech");
    expect(rows.find(row => row.commissionCode === "NB4801")?.commissionLabel).toBe("Provize za navýšení po 4 letech");
  });
  it.each(["NB036", "NB36"])("accepts legacy %s without paying the card commission", code => {
    const rows = compute([receipt(code, 75, "2028-6")]);
    expect(rows.filter(row => row.payoutStatus === "paid").map(row => row.commissionCode)).toEqual([code]);
    expect(rows.filter(row => row.payoutStatus !== "paid").map(row => row.commissionCode)).toEqual(["B0301", "B4801"]);
  });
  it("does not settle an original contract with an increase receipt", () => {
    const rows = compute([receipt("NB3601", 75, "2028-6")], false);
    expect(rows.find(row => row.commissionCode === "B3601")?.payoutStatus).not.toBe("paid");
    expect(rows.filter(row => row.payoutStatus === "paid").map(row => row.commissionCode)).toEqual(["NB3601"]);
  });
  it("keeps unknown NB codes and negative corrections separate", () => {
    const rows = compute([receipt("NB999", 25, "2029-6"), receipt("NB3601", -75, "2028-6")]);
    expect(rows.filter(row => row.payoutStatus !== "paid").map(row => row.commissionCode)).toEqual(["B0301", "B3601", "B4801"]);
    expect(rows.find(row => row.commissionCode === "NB3601")?.amount).toBe(-75);
  });
});
