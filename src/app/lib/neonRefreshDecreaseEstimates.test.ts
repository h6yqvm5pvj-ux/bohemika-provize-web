import { describe, expect, it } from "vitest";
import { projectNeonRefreshDecreaseEstimates } from "./neonRefreshDecreaseEstimates";

const items = [{ code: "A101", title: "Provize A101", amount: 450 }, { code: "B0301", title: "Provize B0301", amount: 125 }];
const root = { id: "root", contractNumber: "SYNTHETIC", userEmail: "owner@example.test", productKey: "neon",
  isRefresh: true, commissionBaseSource: "commission_statement", refreshCommissionBase: { calculationAnnualPremium: 3600 },
  effectiveInputAmount: 900, policyStartDate: "2023-02-01", items };
const oldItems = [{ ...items[0], amount: -150 }, { ...items[1], amount: -41.67 }];
const originalReceipt = { code: "A101", amount: -269.8 };
const change = { id: "change", contractNumber: root.contractNumber, userEmail: root.userEmail, productKey: "neon",
  entryType: "endorsement", rootContractEntryId: root.id, parentContractEntryId: root.id, previousInputAmount: 900,
  newInputAmount: 400, policyStartDate: "2025-02-01", inputAmount: 300, calculationInputAmount: 300,
  items: oldItems, total: -191.67, result: { items: oldItems, total: -191.67 }, commissionPayouts: [originalReceipt],
  managerOverrides: [{ email: "manager@example.test", items: [{ ...items[0], amount: -50 }], total: -50 }] };

describe("existing confirmed NEON Refresh decrease estimates", () => {
  it("recalculates the forecast before settlement, with the same result on each read and with intact receipts", () => {
    const expectedItems = [{ ...items[0], amount: -270 }, { ...items[1], amount: -75 }];
    const entries = [change, root];
    const calculated = projectNeonRefreshDecreaseEstimates(entries);
    expect(calculated[0]).toMatchObject({ inputAmount: 180, calculationInputAmount: 180, total: -345,
      items: expectedItems, result: { items: expectedItems, total: -345 }, commissionPayouts: [originalReceipt],
      managerOverrides: [{ email: "manager@example.test", items: [{ ...items[0], amount: -30 }], total: -30 }] });
    expect(projectNeonRefreshDecreaseEstimates(calculated)).toEqual(calculated);
    expect(projectNeonRefreshDecreaseEstimates([{ ...change, commissionPayouts: [] }, root])[0]).toMatchObject({ items: expectedItems });
    expect(change.items).toBe(oldItems);
  });
  it.each([{ userEmail: "other@example.test" }, { contractNumber: "OTHER" }, { productKey: "flexi" },
    { rootContractEntryId: "other" }, { parentContractEntryId: "another-change" }, { previousInputAmount: 600 },
    { items: [{ ...items[0], amount: -111 }] }, { calculationInputAmount: 99 }])("preserves unrelated and edited estimates (%j)", patch => {
    const entry = { ...change, ...patch };
    expect(projectNeonRefreshDecreaseEstimates([entry, root])[0]).toBe(entry);
  });
});
