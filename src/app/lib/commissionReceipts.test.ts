import { describe, expect, it } from "vitest";
import { indexLifeIncreaseReceiptEvidence, uniqueFamilyCommissionReceipts, type LifeIncreaseReceiptEvidence } from "./commissionReceipts";
const owner = "owner@example.test";
const receipt = { key: "source-row-1", statementId: "source-1", writtenBy: owner, code: "NV101", amount: 100 };
const root = { id: "root", userEmail: owner, productKey: "neon", contractNumber: "SYNTHETIC", entryType: "contract", commissionPayouts: [receipt] };
const amendment = { ...root, id: "one", rootContractEntryId: "root", entryType: "endorsement" };

describe("one receipt per authorized policy family", () => {
  it("keeps an increase on its amendment and preserves all stored objects", () => {
    const entries = [root, amendment];
    const before = JSON.stringify(entries);
    expect(uniqueFamilyCommissionReceipts(entries).map(entry => entry.commissionPayouts.length)).toEqual([0, 1]);
    expect(JSON.stringify(entries)).toBe(before);
    expect(uniqueFamilyCommissionReceipts([...entries].reverse()).map(entry => entry.commissionPayouts.length)).toEqual([1, 0]);
  });
  it("does not collapse two equal payments from different statement rows", () => {
    const rows = [receipt, { ...receipt, key: "source-row-2" }];
    expect(uniqueFamilyCommissionReceipts([{ ...root, commissionPayouts: rows }])[0].commissionPayouts).toHaveLength(2);
  });
  it.each([
    { userEmail: "other@example.test" }, { rootContractEntryId: "other-root" },
    { contractNumber: "OTHER" }, { productKey: "flexi" }, { source: "manager" },
    { commissionPayouts: [{ ...receipt, writtenBy: "manager@example.test" }] },
    { commissionPayouts: [{ ...receipt, statementId: "source-2" }] },
  ])("never deduplicates across ownership, family, product, role or author: %j", overrides => {
    expect(uniqueFamilyCommissionReceipts([root, { ...amendment, ...overrides }]).map(entry => entry.commissionPayouts.length)).toEqual([1, 1]);
  });
  it("does not invent an identity for legacy records missing their source", () => {
    const legacy = { ...receipt, statementId: null };
    expect(uniqueFamilyCommissionReceipts([{ ...root, commissionPayouts: [legacy, legacy] }])[0].commissionPayouts).toHaveLength(2);
  });

  it("uses the stored row identity to distinguish equal payments within one statement", () => {
    const first = { ...receipt, key: "first" };
    const second = { ...receipt, key: "second" };
    const contractNumber = "123456789";
    const entries = [
      { ...root, contractNumber, commissionPayouts: [first, second] },
      { ...amendment, contractNumber, policyStartDate: "2025-05-01", premiumDelta: 100, commissionPayouts: [first, second] },
      { ...amendment, id: "two", contractNumber, policyStartDate: "2025-09-01", premiumDelta: 100, commissionPayouts: [] },
    ];
    const rows: LifeIncreaseReceiptEvidence[] = [
      { ...second, contractNumber, productKey: "neon", source: "own", validFrom: "01.09.2025", baseAmount: 1200, signedAt: null },
      { ...first, contractNumber, productKey: "neon", source: "own", validFrom: "01.05.2025", baseAmount: 1200, signedAt: null },
    ];
    const source = { id: receipt.statementId, writer: owner, rows };
    const assign = (evidence = source) => uniqueFamilyCommissionReceipts(entries, indexLifeIncreaseReceiptEvidence([evidence]))
      .map(entry => entry.commissionPayouts.map(payout => payout.key));
    expect(assign()).toEqual([[], ["first"], ["second"]]);
    expect(assign({ ...source, writer: "other@example.test" })).toEqual([[], ["first", "second"], []]);
    expect(assign({ ...source, rows: rows.map(row => ({ ...row, contractNumber: "987654321" })) })).toEqual([[], ["first", "second"], []]);
    expect(assign({ ...source, rows: [...rows, { ...rows[0], validFrom: "01.05.2025" }] })).toEqual([[], ["first", "second"], []]);
  });

  it("reconciles both archived month-dated receipts when an increase is entered after the statement", () => {
    const contractNumber = "123456789";
    const receipts = [receipt, { ...receipt, key: "second", code: "NB0301", amount: 25 }]
      .map(payout => ({ ...payout, statementPeriod: "01.05.2025 - 31.05.2025" }));
    const original = { ...receipt, key: "initial", code: "A101", amount: 500 };
    const entries = [
      { ...root, contractNumber, commissionPayouts: [original, ...receipts] },
      { ...amendment, contractNumber, policyStartDate: "2025-05-17", premiumDelta: 100, commissionPayouts: [] },
    ];
    const rows: LifeIncreaseReceiptEvidence[] = receipts.map(payout => ({
      ...payout, contractNumber, productKey: "neon", source: "own", validFrom: "01.05.2025", signedAt: "01.05.2025", baseAmount: 1200,
    }));
    const evidence = indexLifeIncreaseReceiptEvidence([{ id: receipt.statementId, writer: owner, rows }]);
    const projected = uniqueFamilyCommissionReceipts(entries, evidence);
    expect(projected.map(entry => entry.commissionPayouts.map(payout => [payout.code, payout.amount]))).toEqual([
      [["A101", 500]], [["NV101", 100], ["NB0301", 25]],
    ]);
    expect(uniqueFamilyCommissionReceipts(projected, evidence)).toEqual(projected);
    expect(entries[0].commissionPayouts).toEqual([original, ...receipts]);
  });
});
