import { describe, expect, it } from "vitest";
import { buildContractFinancialOverview } from "./contractFinancialOverviewModel";
import type { ContractDoc } from "./contractDetailTypes";

const owner = "owner@example.test";
const manager = "manager@example.test";
const asOf = new Date("2026-01-01T11:00:00Z");
const root: ContractDoc = {
  id: "root", userEmail: owner, productKey: "neon", entryType: "contract",
  inputAmount: 2000, policyStartDate: "2023-02-01", contractSignedDate: "2023-01-10", durationYears: 10,
  items: [
    { title: "Provize po 3 letech", code: "B3601", amount: 1000 },
    { title: "Provize po 4 letech", code: "B4801", amount: 400 },
    { title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 100 },
  ],
};
const decrease: ContractDoc = {
  id: "decrease", userEmail: owner, productKey: "neon", entryType: "endorsement",
  rootContractEntryId: "root", parentContractEntryId: "root", policyStartDate: "2025-02-01",
  previousInputAmount: 2000, newInputAmount: 1500, premiumDelta: -500, changeType: "decrease", items: [],
};
const calculate = (contract = root, timeline = [contract, decrease], viewerEmail: string | null = owner, date = asOf) =>
  buildContractFinancialOverview({ contract, timeline, ownerEmail: owner, viewerEmail, asOf: date });

describe("contract financial overview", () => {
  it("aggregates the amended family through the existing period-aware cashflow plan", () => {
    const model = calculate();
    expect(model).toMatchObject({ recipient: "own", paidAmount: 0, payoutCount: 0,
      periodFrom: "2026-01-01", periodUntil: "2027-01-01", expectedAmount: 825, entriesCount: 2 });
    expect(model.nextPayout).toMatchObject({ amount: 825, count: 2 });
    expect(model.nextPayout?.date.toISOString()).toBe("2026-03-24T23:00:00.000Z");
    expect(root.items?.[0].amount).toBe(1000);
  });

  it("keeps actual receipts separate and forecasts only the reduced partial balance", () => {
    const partiallyPaid: ContractDoc = { ...root, commissionPayouts: [
      { key: "part-1", code: "B3601", amount: 300, status: "difference", payoutMonthKey: "2026-03", writtenBy: owner },
      { key: "part-2", code: "B3601", amount: 100, status: "difference", payoutMonthKey: "2026-04", writtenBy: owner },
    ] };
    const model = calculate(partiallyPaid);
    expect(model).toMatchObject({ paidAmount: 400, payoutCount: 2, expectedAmount: 425 });
    expect(model.nextPayout?.amount).toBe(425);
  });

  it("automatically replaces the exact Kooperativa B periods with older C receipts in the family forecast", () => {
    const inherited: ContractDoc = { id: "car", userEmail: owner, productKey: "kooperativaAuto", entryType: "contract",
      policyStartDate: "2024-05-03", contractSignedDate: "2024-05-03", frequencyRaw: "annual",
      items: [{ title: "Okamžitá provize", code: "A101", amount: 742.54 },
        { title: "Následná provize", code: "B101", amount: 742.54 }],
      commissionPayouts: [
        { key: "c102", code: "C102", amount: 1065.13, status: "paid", payoutMonthKey: "2025-09", writtenBy: owner },
        { key: "c103", code: "C103", amount: 965.98, status: "paid", payoutMonthKey: "2026-03", writtenBy: owner },
      ] };
    const model = calculate(inherited, [inherited], owner, new Date("2026-11-01T11:00:00Z"));
    expect(model).toMatchObject({ paidAmount: 2031.11, payoutCount: 2, expectedAmount: 0,
      nextPayout: { amount: 742.54, count: 1 } });
    expect(model.nextPayout?.date.toISOString().slice(0, 10)).toBe("2028-06-24");
    expect(inherited.commissionPayouts?.map(payout => payout.code)).toEqual(["C102", "C103"]);
  });

  it("never converts a larger paid actual into a negative forecast or re-prices it", () => {
    const paid: ContractDoc = { ...root, commissionPayouts: [
      { key: "paid", code: "B3601", amount: 1000, status: "paid", payoutMonthKey: "2026-03", writtenBy: owner },
    ] };
    expect(calculate(paid)).toMatchObject({ paidAmount: 1000, payoutCount: 1, expectedAmount: 75,
      nextPayout: { amount: 75, count: 1 } });
  });

  it("treats a legacy statusless receipt as paid locally so it is not forecast a second time", () => {
    const legacy = { key: "legacy-paid", code: "B3601", amount: 1000, payoutMonthKey: "2026-03" };
    const paid: ContractDoc = { ...root, commissionPayouts: [legacy] };
    expect(calculate(paid)).toMatchObject({ paidAmount: 1000, payoutCount: 1, expectedAmount: 75,
      nextPayout: { amount: 75, count: 1 } });
    expect(legacy).not.toHaveProperty("status");
  });

  it.each([undefined, "2026-13", "invalid"])("does not guess an unpaid balance when a related receipt has no usable month: %s", payoutMonthKey => {
    const paid: ContractDoc = { ...root, commissionPayouts: [{ key: "unplaced", code: "B3601", amount: 1000,
      status: "paid", payoutMonthKey, writtenBy: owner }] };
    expect(calculate(paid)).toMatchObject({ paidAmount: 1000, payoutCount: 1, expectedAmount: null, nextPayout: null });
  });

  it("keeps a receipt with no commission code from appearing both as received and expected", () => {
    const paid: ContractDoc = { ...root, commissionPayouts: [{ key: "unplaced", amount: 1000,
      status: "paid", payoutMonthKey: "2026-03", writtenBy: owner }] };
    expect(calculate(paid)).toMatchObject({ paidAmount: 1000, payoutCount: 1, expectedAmount: null, nextPayout: null });
  });

  it("normalizes the sign of recorded deductions without mutating a source or duplicating a pending deduction", () => {
    const base: ContractDoc = { ...root, policyStartDate: "2026-02-01", contractSignedDate: "2026-01-10",
      items: [{ title: "Provize A101", code: "A101", amount: 1000 }] };
    const receipt = { key: "storno", code: "A101", amount: 100, status: "storno", payoutMonthKey: "2026-02", writtenBy: owner };
    const reduced: ContractDoc = { ...decrease, policyStartDate: "2026-02-01", contractSignedDate: "2026-01-10",
      items: [{ title: "Provize A101", code: "A101", amount: -100 }], commissionPayouts: [receipt] };
    expect(calculate(base, [base, reduced])).toMatchObject({ paidAmount: -100, payoutCount: 1,
      expectedAmount: null, nextPayout: null });
    expect(receipt.amount).toBe(100);
  });

  it("preserves the manager recipient and applies zero-item decreases without leaking other rates or receipts", () => {
    const managed: ContractDoc = { ...root, managerOverrides: [
      { email: manager, position: "manazer8", commissionMode: "standard", total: 200,
        items: [{ title: "Provize po 3 letech", code: "B3601", amount: 200 }] },
      { email: "other@example.test", position: "manazer9", commissionMode: "standard", total: 99999,
        items: [{ title: "Provize po 3 letech", code: "B3601", amount: 99999 }] },
    ], commissionPayouts: [
      { key: "mine", code: "A101", amount: 20, status: "paid", writtenBy: manager },
      { key: "owner", code: "A101", amount: 9000, status: "paid", writtenBy: owner },
      { key: "unattributed", code: "A101", amount: 8000, status: "paid" },
    ] };
    const model = calculate(managed, [managed, decrease], ` ${manager.toUpperCase()} `);
    expect(model).toMatchObject({ recipient: "manager", paidAmount: 20, payoutCount: 1,
      expectedAmount: 150, nextPayout: { amount: 150, count: 1 }, entriesCount: 2 });
  });

  it("reports historical manager receipts when no authorized forecast calculation exists", () => {
    const oldManager: ContractDoc = { ...root, commissionPayouts: [
      { key: "historical", code: "A101", amount: 20, status: "paid", writtenBy: manager },
    ] };
    expect(calculate(oldManager, [oldManager, decrease], manager)).toMatchObject({
      recipient: "manager", paidAmount: 20, payoutCount: 1, expectedAmount: null, nextPayout: null,
    });
  });

  it("withholds receipts and forecast for a viewer without their own calculation or receipts", () => {
    expect(calculate(root, [root, decrease], manager)).toMatchObject({
      recipient: "unavailable", paidAmount: 0, payoutCount: 0, expectedAmount: null, nextPayout: null,
    });
    expect(calculate(root, [root, decrease], null)).toMatchObject({ recipient: "unavailable", expectedAmount: null, paidAmount: 0 });
  });

  it("keeps visible amendment receipts without claiming a full family forecast when the root is inaccessible", () => {
    const visible: ContractDoc = { ...decrease, premiumDelta: 500, previousInputAmount: 2000, newInputAmount: 2500,
      changeType: "increase", items: [{ title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 40 }],
      commissionPayouts: [{ key: "visible", code: "A101", amount: 20, status: "paid", writtenBy: owner }] };
    expect(calculate(visible, [visible])).toMatchObject({ paidAmount: 20, payoutCount: 1, entriesCount: 1,
      expectedAmount: null, nextPayout: null });
  });

  it("sums corrections and storno net, including legacy own receipts, while excluding pending and invalid records", () => {
    const receipts: ContractDoc = { ...root, items: [], commissionPayouts: [
      { key: "paid", code: "A101", amount: 500, status: "paid", writtenBy: owner },
      { key: "storno", code: "A101", amount: 100, status: "storno", writtenBy: owner },
      { key: "negative", code: "A101", amount: -50, status: "difference", writtenBy: owner },
      { key: "legacy", code: "A101", amount: 25 },
      { key: "pending", code: "B3601", amount: 1000, status: "pending", writtenBy: owner },
      { key: "invalid", code: "B3601", amount: NaN, status: "paid", writtenBy: owner },
      { key: "zero", code: "B3601", amount: 0, status: "paid", writtenBy: owner },
      { key: "foreign", code: "B3601", amount: 99999, status: "paid", writtenBy: manager },
    ] };
    expect(calculate(receipts, [receipts])).toMatchObject({ paidAmount: 375, payoutCount: 4, expectedAmount: null });
  });

  it("deduplicates explicit receipt identities without combining distinct instalments or keyless receipts", () => {
    const paid = { key: "same", statementId: "s-1", code: "A101", amount: 100, status: "paid", writtenBy: owner };
    const base: ContractDoc = { ...root, items: [], commissionPayouts: [paid,
      { ...paid, code: "A102", amount: 75 }, { amount: 10, status: "paid", writtenBy: owner },
    ] };
    const addon: ContractDoc = { ...decrease, commissionPayouts: [paid,
      { ...paid, statementId: "s-2", amount: 50 }, { amount: 10, status: "paid", writtenBy: owner },
    ] };
    expect(calculate(base, [base, addon, addon])).toMatchObject({ paidAmount: 245, payoutCount: 5, entriesCount: 2 });
  });

  it("excludes foreign owners, unrelated products, disconnected and different-root histories", () => {
    const unexpected: ContractDoc[] = [
      { ...decrease, id: "foreign", userEmail: manager },
      { ...decrease, id: "product", productKey: "flexi" },
      { ...decrease, id: "disconnected", parentContractEntryId: "missing" },
      { ...decrease, id: "other", rootContractEntryId: "other-root" },
      { ...decrease, id: "self", parentContractEntryId: "self" },
    ];
    expect(calculate(root, [root, ...unexpected])).toMatchObject({ entriesCount: 1, expectedAmount: 1100 });
    expect(buildContractFinancialOverview({ contract: { ...root, userEmail: manager }, timeline: [root, decrease],
      ownerEmail: owner, viewerEmail: owner, asOf })).toMatchObject({ recipient: "unavailable", entriesCount: 0, expectedAmount: null });
  });

  it("uses the current displayed root snapshot after edits instead of a stale duplicate", () => {
    const current = { ...root, items: [{ title: "Provize po 3 letech", code: "B3601", amount: 2000 }] };
    expect(calculate(current, [root, decrease])).toMatchObject({ entriesCount: 2, expectedAmount: 1500 });
  });

  it("distinguishes a valid zero forecast from missing calculation data", () => {
    const zero = { ...root, items: [{ title: "Provize po 3 letech", code: "B3601", amount: 0 }] };
    expect(calculate(zero, [zero])).toMatchObject({ expectedAmount: 0, nextPayout: null });
    const missing = { ...root, items: [] };
    expect(calculate(missing, [missing])).toMatchObject({ expectedAmount: null, nextPayout: null });
    const undated = { ...root, policyStartDate: undefined, contractSignedDate: undefined };
    expect(calculate(undated, [undated])).toMatchObject({ expectedAmount: null, nextPayout: null });
  });

  it("does not present an incomplete family calculation as a complete known forecast", () => {
    const incomplete = { ...root, items: [] };
    const increase: ContractDoc = { ...decrease, id: "increase", parentContractEntryId: "root", policyStartDate: "2025-02-01",
      previousInputAmount: 2000, newInputAmount: 2500, premiumDelta: 500, changeType: "increase",
      items: [{ title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 40 }] };
    expect(calculate(incomplete, [incomplete, increase])).toMatchObject({ expectedAmount: null, nextPayout: null });
    expect(calculate({ ...root, contractNumber: "A1" }, [{ ...root, contractNumber: "A1" },
      { ...decrease, contractNumber: "unrelated" }])).toMatchObject({ entriesCount: 1, expectedAmount: 1100 });
  });

  it("shows the next deferred commission beyond twelve months while keeping the annual forecast zero", () => {
    const deferred: ContractDoc = { ...root, policyStartDate: "2026-02-01",
      items: [{ title: "Provize po 3 letech", code: "B3601", amount: 1000 }] };
    const model = calculate(deferred, [deferred]);
    expect(model.expectedAmount).toBe(0);
    expect(model.nextPayout).toMatchObject({ amount: 1000, count: 1 });
    expect(model.nextPayout?.date.toISOString()).toBe("2029-03-24T23:00:00.000Z");
  });

  it("skips a fully offset payment day when selecting the next actual expected cash movement", () => {
    const base: ContractDoc = { ...root, policyStartDate: "2026-02-01", contractSignedDate: "2026-01-10",
      items: [{ title: "Provize A101", code: "A101", amount: 1000 },
        { title: "Provize po 4 letech", code: "B4801", amount: 400 }] };
    const offset: ContractDoc = { ...decrease, policyStartDate: "2026-02-01", contractSignedDate: "2026-01-10",
      newInputAmount: 1000, premiumDelta: -1000,
      items: [{ title: "Provize A101", code: "A101", amount: -500 }] };
    const model = calculate(base, [base, offset]);
    expect(model.expectedAmount).toBe(0);
    expect(model.nextPayout).toMatchObject({ amount: 200, count: 1 });
    expect(model.nextPayout?.date.toISOString()).toBe("2030-03-24T23:00:00.000Z");
  });

  it("includes today's forecast, excludes the same day twelve months later and respects Prague midnight", () => {
    const annual: ContractDoc = { ...root, productKey: "allianzAuto", policyStartDate: "2025-01-15", frequencyRaw: "annual",
      items: [{ title: "Následná provize", code: "B101", amount: 100 }] };
    // 23:30 UTC is already 25 February in Prague; renewal pays on 25 February.
    expect(calculate(annual, [annual], owner, new Date("2026-02-24T23:30:00Z"))).toMatchObject({
      periodFrom: "2026-02-25", periodUntil: "2027-02-25", expectedAmount: 100,
      nextPayout: { amount: 100, count: 1 },
    });
  });

  it("clamps twelve calendar months from leap day rather than forecasting 365 fixed days", () => {
    const model = calculate(root, [root], owner, new Date("2024-02-29T12:00:00Z"));
    expect(model.periodFrom).toBe("2024-02-29");
    expect(model.periodUntil).toBe("2025-02-28");
  });

  it("aggregates a separate positive increase tranche and later reductions exactly once", () => {
    const increase: ContractDoc = { ...decrease, id: "increase", parentContractEntryId: "decrease", policyStartDate: "2025-04-01",
      previousInputAmount: 1500, newInputAmount: 1800, premiumDelta: 300, changeType: "increase",
      items: [{ title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 40 }] };
    const later: ContractDoc = { ...decrease, id: "later", parentContractEntryId: "increase", policyStartDate: "2026-02-01",
      previousInputAmount: 1800, newInputAmount: 900, premiumDelta: -900 };
    const model = calculate(root, [root, decrease, increase, later]);
    expect(model.entriesCount).toBe(4);
    expect(model.expectedAmount).toBe(432.5);
    expect(model.nextPayout?.amount).toBe(412.5);
  });

  it("does not change future expectations before a future amendment becomes effective", () => {
    const future = { ...decrease, policyStartDate: "2027-01-01" };
    expect(calculate(root, [root, future])).toMatchObject({ expectedAmount: 1100 });
  });
});
