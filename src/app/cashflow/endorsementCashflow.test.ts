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
    expect(rows[0]).toMatchObject({ amount: 300, payoutStatus: "paid", predictedAmount: 225,
      commissionPayoutKey: "actual", commissionStatementNumber: "SYNTHETIC", commissionPeriodStart: "2025-02-01" });
    expect(rows[0].date).toEqual(new Date(2026, 5, 25));
    expect(rows[0].premiumChangeOriginalAmount).toBeUndefined();
  });

  it("keeps multiple actual receipts and closes the commission regardless of the amount", () => {
    const partial = { ...root, commissionPayouts: [
      { key: "part-1", code: "B3601", status: "difference", amount: 100, payoutMonthKey: "2025-03" },
      { key: "part-2", code: "B3601", status: "difference", amount: 50, payoutMonthKey: "2025-04" },
    ] };
    const rows = generate(partial).filter(item => item.commissionCode === "B3601");
    expect(rows).toEqual([
      expect.objectContaining({ amount: 100, predictedAmount: 225, payoutStatus: "paid" }),
      expect.objectContaining({ amount: 50, isStatementOnly: true, payoutStatus: "paid" }),
    ]);
    expect(groupItemsByMonth(rows).reduce((sum, month) => sum + month.total, 0)).toBe(150);
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

  it("uses the full reduced premium for open components and reduces a separate top-up for an already paid component", () => {
    const increase: EntryDoc = { ...decrease, id: "increase", parentContractEntryId: "decrease", policyStartDate: "2025-02-01",
      previousInputAmount: 1500, newInputAmount: 1800, premiumDelta: 300,
      items: [{ title: "Provize po 3 letech", code: "B3601", amount: 60 }] };
    const later: EntryDoc = { ...decrease, id: "later", parentContractEntryId: "increase", policyStartDate: "2026-02-01",
      previousInputAmount: 1800, newInputAmount: 900, premiumDelta: -900, items: [] };
    const paid = { ...root, commissionPayouts: [{ code: "B3601", status: "paid", amount: 225, payoutMonthKey: "2025-01" }] };
    const rows = generate(paid, [decrease, increase, later]);
    expect(rows.find(item => item.entryId === root.id && item.commissionCode === "B4801")?.amount).toBe(180);
    expect(rows.find(item => item.entryId === increase.id && item.commissionCode === "B3601")?.amount).toBe(30);
  });

  it("projects one NEON recurring payment on the full amended premium and keeps the increase commissions separate", () => {
    const original: EntryDoc = {
      ...root, inputAmount: 900, policyStartDate: "2020-11-01", contractSignedDate: "2020-09-02",
      items: [...root.items!, { title: "Pečovatelská provize (5.–10. rok)", code: "B201-B206", amount: 299.38 }],
      commissionPayouts: [
        { code: "A101", status: "paid", amount: 1000, statementPeriod: "01.11.2020 - 30.11.2020", payoutMonthKey: "2020-12" },
        { key: "combined-b202", code: "B202", status: "paid", amount: 316.34, expectedAmount: 299.38, payoutMonthKey: "2025-12" },
      ],
    };
    const increase: EntryDoc = {
      ...decrease, id: "increase", policyStartDate: "2020-12-01", contractSignedDate: "2020-11-24",
      previousInputAmount: 900, newInputAmount: 951, premiumDelta: 51, inputAmount: 51,
      items: [
        { title: "Provize A101", code: "A101", amount: 350 },
        { title: "Provize B0301", code: "B0301", amount: 80 },
        { title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 5.67 },
        { title: "Pečovatelská provize (5.–10. rok)", code: "B201-B206", amount: 16.96 },
      ],
    };
    const rows = generate(original, [increase]);
    expect(rows.filter(item => item.entryId === increase.id).map(item => item.commissionCode)).toEqual(["A101", "B0301"]);
    expect(rows.filter(item => item.commissionCode === "B101-B104").map(item => item.amount)).toEqual([105.67, 105.67, 105.67, 105.67]);
    expect(rows.filter(item => item.commissionCode === "B201-B206" && item.commissionPeriodStart === "2025-11-01")).toEqual([
      expect.objectContaining({ amount: 316.34, predictedAmount: 316.34, payoutStatus: "paid", commissionPayoutKey: "combined-b202" }),
    ]);
    expect(rows.find(item => item.commissionCode === "B201-B206" && item.commissionPeriodStart === "2026-11-01")).toMatchObject({
      amount: 316.34, premiumChangeOriginalAmount: 299.38, premiumChangeEntryId: increase.id,
    });
    expect(rows.find(item => item.commissionCode === "B3601")?.amount).toBe(317);
  });

  it.each(["paid", "difference", "other recipient", "range", "storno"] as const)(
    "closes only an exact NEON recurring code with an active receipt (%s)", scenario => {
      const original: EntryDoc = { ...root, inputAmount: 500, policyStartDate: "2023-10-01",
        items: [{ title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 32 }],
        commissionPayouts: [
          { code: scenario === "range" ? "B101-B104" : "B102", amount: 1.8, expectedAmount: 32,
            payoutMonthKey: "2025-8", status: scenario === "paid" ? "paid" : "difference",
            writtenBy: scenario === "other recipient" ? viewer : owner },
          ...(scenario === "storno" ? [{ code: "B102", amount: -1.8, status: "storno", payoutMonthKey: "2025-9", writtenBy: owner }] : []),
        ],
      };
      const increase: EntryDoc = { ...decrease, id: "increase", policyStartDate: "2024-02-01",
        previousInputAmount: 500, newInputAmount: 530, premiumDelta: 30, items: [],
      };
      const rows = generateCashflow([original, increase], 5, owner, new Date(2026, 10, 25));
      const second = rows.filter(item => item.entryId === root.id && item.commissionCode === "B101-B104" &&
        item.commissionPeriodStart === "2025-10-01");
      expect(second).toHaveLength(1);
      if (scenario === "paid" || scenario === "difference") {
        expect(second[0]).toMatchObject({ amount: 1.8, predictedAmount: 33.92, date: new Date(2025, 7, 25), payoutStatus: "paid" });
      } else {
        expect(second[0].amount).toBe(33.92);
        expect(second[0].payoutStatus).toBeUndefined();
      }
      expect(rows.find(row => row.commissionCode === "B101-B104" && row.commissionPeriodStart === "2026-10-01")?.amount).toBe(33.92);
    },
  );

  it.each([false, true])("consolidates open NEON components on original dates (B0301 already paid: %s)", earlyCardCommission => {
    const original: EntryDoc = {
      ...root, inputAmount: 600,
      items: [
        { title: "Provize A101", code: "A101", amount: 2455.34 },
        { title: "Provize B0301", code: "B0301", amount: 624.24 },
        { title: "Provize po 3 letech", code: "B3601", amount: 1523.88 },
        { title: "Provize po 4 letech", code: "B4801", amount: 274.18 },
      ],
      commissionPayouts: [
        { key: "acq", code: "A101", status: "paid", amount: 2454.85, statementPeriod: "01.02.2022 - 28.02.2022", payoutMonthKey: "2022-03" },
        { key: "increase-acq", code: "NV101", status: "paid", amount: 7123.69, statementPeriod: "01.03.2022 - 31.03.2022", payoutMonthKey: "2022-04" },
        earlyCardCommission
          ? { key: "card", code: "B0301", status: "paid", amount: 624.24, statementPeriod: "01.02.2022 - 28.02.2022", payoutMonthKey: "2022-03" }
          : { key: "card", code: "B0301", status: "difference", amount: 2398.56, expectedAmount: 624.24, payoutMonthKey: "2022-05" },
        { key: "increase-card", code: "NB0301", status: "paid", amount: 1811.39, payoutMonthKey: "2022-05" },
        { key: "other-recipient", code: "B0301", status: "paid", amount: 624.24,
          writtenBy: viewer, statementPeriod: "01.02.2022 - 28.02.2022", payoutMonthKey: "2022-03" },
      ],
    };
    const increase: EntryDoc = {
      ...decrease, id: "increase", contractNumber: original.contractNumber,
      policyStartDate: "2022-03-18", contractSignedDate: "2022-02-15",
      previousInputAmount: 600, newInputAmount: 2450, premiumDelta: 1850, inputAmount: 1850,
      items: [
        { title: "Provize A101", code: "A101", amount: 7570.64 },
        { title: "Provize B0301", code: "B0301", amount: 1924.74 },
        { title: "Provize po 3 letech", code: "B3601", amount: 4698.63 },
        { title: "Provize po 4 letech", code: "B4801", amount: 845.38 },
      ],
      commissionPayouts: [{ key: "increase-3yr", code: "NB3601", status: "paid", amount: 4422.24, payoutMonthKey: "2025-04" }],
    };
    const entries = [increase, original];
    const before = structuredClone(entries);
    const rows = generateCashflow(entries, 2, owner, new Date(2025, 9, 1));
    expect(rows.some(row => row.commissionPayoutKey === "other-recipient")).toBe(false);
    expect(rows.filter(row => row.commissionCode === "B4801")).toEqual([
      expect.objectContaining({ entryId: original.id, amount: 1119.57, commissionPeriodStart: "2026-02-01",
        premiumChangeEntryId: increase.id }),
    ]);
    expect(rows.filter(row => row.commissionCode === "B3601")).toEqual([
      expect.objectContaining({ entryId: original.id, amount: 6222.51, commissionPeriodStart: "2025-02-01" }),
    ]);
    expect(rows.find(row => row.commissionCode === "NB3601")).toMatchObject({
      amount: 4422.24, payoutStatus: "paid", predictedAmount: 0, isStatementOnly: true,
    });
    expect(rows.filter(row => ["A101", "NV101"].includes(row.commissionCode ?? ""))).toEqual([
      expect.objectContaining({ commissionCode: "A101", amount: 2454.85, predictedAmount: 2455.34 }),
      expect.objectContaining({ commissionCode: "NV101", entryId: increase.id, amount: 7123.69, predictedAmount: 7570.64 }),
    ]);
    const cardForecasts = rows.filter(row => row.commissionCode === "B0301" && row.payoutStatus !== "paid");
    expect(cardForecasts).toEqual([]);
    expect(rows.find(row => row.commissionCode === "NB0301")).toMatchObject({
      amount: 1811.39, payoutStatus: "paid", predictedAmount: earlyCardCommission ? 1924.74 : 0,
    });
    expect(entries).toEqual(before);
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
