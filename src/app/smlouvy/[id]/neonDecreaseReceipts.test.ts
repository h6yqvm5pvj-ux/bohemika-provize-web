import { describe, expect, it } from "vitest";
import { neonCommissionDisplayFamily } from "./neonDecreaseReceipts";
import type { ContractCommissionPayout, ContractDoc } from "./contractDetailTypes";

const owner = "owner@example.test";
const manager = "manager@example.test";
const receipt = { statementId: "statement", key: "row", writtenBy: owner, code: "A101", amount: -99.58,
  statementPeriod: "01.05.2025 - 31.05.2025", status: "storno" };
const root: ContractDoc = { id: "root", entryType: "contract", userEmail: owner, productKey: "neon", contractNumber: "SYNTHETIC" };
const decrease: ContractDoc = { ...root, id: "decrease", entryType: "endorsement", parentContractEntryId: root.id,
  rootContractEntryId: root.id, changeType: "decrease", premiumDelta: -20, policyStartDate: "2025-04-09",
  items: [{ title: "💸 Provize A101", amount: -100 }] };

function project(rows: ContractCommissionPayout[], changes = [decrease], viewer: string | null = owner, original = root) {
  const entry = { ...original, commissionPayouts: rows };
  return neonCommissionDisplayFamily(entry, [entry, ...changes], owner, viewer);
}

describe("statement deductions for retroactive NEON premium decreases", () => {
  it("uses each source row once across repeated reads and preserves the stored entries", () => {
    const paid = { ...receipt, status: "paid", amount: 320, key: "paid" };
    const copy = { ...decrease, commissionPayouts: [{ ...receipt }] };
    const projected = project([paid, receipt], [copy]);
    expect(projected.map(entry => entry.commissionPayouts)).toEqual([[paid], [receipt]]);
    expect(neonCommissionDisplayFamily(projected[0], projected, owner, owner)).toEqual(projected);
    expect(copy.commissionPayouts).toEqual([receipt]);
  });

  it("leaves competing receipts, competing amendments and already occupied components unresolved", () => {
    const competing = { ...receipt, key: "other", amount: -101 };
    expect(project([receipt, competing])[0].commissionPayouts).toHaveLength(2);
    expect(project([receipt], [decrease, { ...decrease, id: "second" }])[0].commissionPayouts).toEqual([receipt]);
    expect(project([receipt], [{ ...decrease, commissionPayouts: [competing] }])[0].commissionPayouts).toEqual([receipt]);
  });

  it("assigns a later statement to the only eligible decrease even when its estimate differs", () => {
    const row = { ...receipt, amount: -130 };
    const projected = project([row]);
    expect(projected[0].commissionPayouts).toEqual([]);
    expect(projected[1].commissionPayouts).toEqual([row]);
    expect(projected[1].items).toEqual(decrease.items);
    expect(neonCommissionDisplayFamily(projected[0], projected, owner, owner)).toEqual(projected);
  });

  it("uses the statement's amendment date or accounting period before comparing estimates across decreases", () => {
    const original = { ...root, policyStartDate: "2024-03-01" };
    const may = { ...decrease, id: "may", policyStartDate: "2025-05-17",
      items: [{ code: "A101", title: "Provize A101", amount: -45 }] };
    const row = { ...receipt, amount: -100, sourceValidFrom: "01.03.2024" };
    // The May receipt happens to equal the earlier April forecast.
    const family = project([row], [may, decrease], owner, original);
    expect(family[1].commissionPayouts).toEqual([row]);
    expect(family[2].commissionPayouts).toBeUndefined();
    const forApril = { ...row, sourceValidFrom: "09.04.2025" };
    expect(project([forApril], [decrease, may], owner, original)[1].commissionPayouts).toEqual([forApril]);
    const late = { ...row, amount: -150, statementPeriod: "01.06.2025 - 30.06.2025" };
    expect(project([late], [decrease, may], owner, original)[0].commissionPayouts).toEqual([late]);
  });

  it.each([
    { statementPeriod: "01.03.2025 - 31.03.2025" }, { statementPeriod: null }, { statementId: null },
    { code: "B101" }, { sourceValidFrom: "12.04.2025" }, { amount: 100, status: "paid" }, { status: "pending" },
    { detail: "Součást opravného výpisu: náhrada původní provize" }, { writtenBy: manager },
  ])("keeps insufficient or conflicting evidence on the original (%j)", patch => {
    const row = { ...receipt, ...patch };
    expect(project([row])[0].commissionPayouts).toEqual([row]);
  });

  it("respects exact reversals, contract cancellation, and the authorized owner and family", () => {
    const offset = { ...receipt, status: "paid", amount: -receipt.amount, key: "prior" };
    expect(project([offset, receipt])[0].commissionPayouts).toEqual([offset, receipt]);
    expect(project([receipt], [decrease], owner, { ...root, status: "storno", stornoDate: "2025-05-01" })[0].commissionPayouts).toEqual([receipt]);
    for (const change of [{ ...decrease, rootContractEntryId: "other" }, { ...decrease, userEmail: manager },
      { ...decrease, contractNumber: "OTHER" }, { ...decrease, productKey: "flexi" as const }]) {
      expect(project([receipt], [change])).toEqual([]);
    }
    expect(project([receipt], [decrease], null)[0].commissionPayouts).toEqual([receipt]);
  });

  it("uses the viewer's own override and receipts when displaying an intercommission", () => {
    const own = { ...receipt, writtenBy: manager, amount: -31 };
    const change: ContractDoc = { ...decrease, managerOverrides: [{ email: manager, position: "manazer4", commissionMode: "standard",
      total: -30, items: [{ title: "Provize A101", code: "A101", amount: -30 }] }] };
    expect(project([receipt, own], [change], manager).map(entry => entry.commissionPayouts)).toEqual([[receipt], [own]]);
    expect(project([receipt, own], [decrease], manager)[0].commissionPayouts).toEqual([receipt, own]);
  });

  describe("Refresh deductions against the unearned share of a confirmed payout", () => {
    const refresh = { ...root, policyStartDate: "2022-09-01", isRefresh: true, effectiveInputAmount: 900,
      commissionBaseSource: "commission_statement", refreshCommissionBase: { calculationAnnualPremium: 3600 } };
    const change = { ...decrease, policyStartDate: "2024-09-01", contractSignedDate: "2024-08-01",
      previousInputAmount: 900, newInputAmount: 400, premiumDelta: -500, items: [
        { title: "A101", code: "A101", amount: -150 }, { title: "B0301", code: "B0301", amount: -45 },
      ] };
    const payment = { ...receipt, amount: 450, status: "paid", statementId: "purchase", career: "7", sourceBaseAmount: 3600,
      statementPeriod: "01.09.2022 - 30.09.2022" };
    const reversal = { ...receipt, amount: -269.83, statementId: "reversals", career: "7", sourceBaseAmount: 3600,
      statementPeriod: "01.08.2024 - 31.08.2024", statementDate: "23.09.2024" };

    it("matches each original component once across the month boundary and keeps its separate forecast", () => {
      const payments = [payment, { ...payment, code: "B0301", key: "purchase-b", amount: 125 }];
      const reversals = [reversal, { ...reversal, code: "B0301", key: "reversal-b", amount: -75.01 }];
      const family = project([...payments, ...reversals], [change], owner, refresh);
      expect(family.map(e => e.commissionPayouts)).toEqual([payments, reversals]);
      expect(family[1].items).toEqual(change.items);
      expect(neonCommissionDisplayFamily(family[0], family, owner, owner)).toEqual(family);
    });
    it.each([
      { statementDate: "31.08.2024" }, { statementPeriod: "01.08.2024 - 30.08.2024" },
      { statementPeriod: "01.10.2024 - 31.10.2024" }, { sourceBaseAmount: 9300 },
      { amount: -255 }, { key: null }, { career: "8" }, { writtenBy: manager },
      { detail: "Součást opravného výpisu: odúčtování" },
    ])("leaves unsupported or conflicting statement evidence unresolved (%j)", patch => {
      const row = { ...reversal, ...patch };
      expect(project([payment, row], [change], owner, refresh)[0].commissionPayouts).toEqual([payment, row]);
    });
    it("requires one documented original, a covered base and a signed change by the prior period end", () => {
      const projectRows = (rows: ContractCommissionPayout[], amendment = change, original = refresh) =>
        project(rows, [amendment], owner, original)[0].commissionPayouts;
      for (const rows of [[reversal], [payment, { ...payment, key: "second" }, reversal],
        [{ ...payment, sourceBaseAmount: 9300 }, reversal], [payment, reversal, { ...reversal, key: "duplicate" }]]) {
        expect(projectRows(rows)).toEqual(rows);
      }
      const rows = [payment, reversal];
      expect(projectRows(rows, { ...change, newInputAmount: 800, premiumDelta: -100 })).toEqual(rows);
      expect(projectRows(rows, { ...change, contractSignedDate: "2024-09-01" })).toEqual(rows);
      expect(projectRows(rows, change, { ...refresh, commissionBaseSource: "calculator" })).toEqual(rows);
      expect(project(rows, [change, { ...change, id: "other" }], owner, refresh)[0].commissionPayouts).toEqual(rows);
    });
  });
});
