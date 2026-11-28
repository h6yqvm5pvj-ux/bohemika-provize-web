import { describe, expect, it } from "vitest";
import { generateCashflow } from "../cashflow/generator";
import type { EntryDoc } from "../cashflow/types";
import { acquisitionCommissionInstallments, payoutsForAcquisitionInstallment } from "../smlouvy/[id]/contractCommissionInstallments";
import { filterStatementDerivedContractDataForViewer } from "../api/contracts/_lib/contractsApi.statementVisibility";
import { createCommissionCodeProjection, projectConfirmedCommissionCodes } from "./commissionPayoutCodeAdjustment";
import type { ConfirmedOpeningCollectionRule } from "./confirmedOpeningCollection";

const writer = "owner@example.test";
const row = (key: string, code: string, amount: number) => ({
  key, code, writtenBy: writer, statementId: "report", amount, expectedAmount: amount, sourceBaseAmount: amount * 10,
  status: "paid", payoutMonthKey: "2025-5",
});
const opening = row("first", "A101", 12), regular = row("full", "B101", 100);
const rule: ConfirmedOpeningCollectionRule = {
  kind: "cpp-auto-separate-opening-collection", writtenBy: writer, confirmedAtMs: 1,
  opening: { statementId: "report", payoutKey: "first", dueDate: "2025-04-02", amountCents: 1200, premiumCents: 12000 },
  regular: { statementId: "report", payoutKey: "full", dueDate: "2025-04-21", amountCents: 10000, premiumCents: 100000 },
};
const entry = { productKey: "cppAuto", frequencyRaw: "semiannual", source: "own", userEmail: writer, id: "test",
  policyStartDate: "2025-04-02", inputAmount: 1000, commissionPayoutCodeAdjustment: rule, commissionPayouts: [regular, opening],
  items: [{ title: "Okamžitá provize", code: "A101", amount: 100 }, { title: "Následná provize", code: "B101", amount: 100, excludeFromTotal: true }],
} satisfies EntryDoc;

describe("separate opening collection on a semiannual policy", () => {
  it("pairs both original receipts once and leaves the later half-year open", () => {
    const visible = filterStatementDerivedContractDataForViewer({ contract: entry, ownerEmail: writer, viewerEmail: writer, teamEmails: [] });
    expect(visible).not.toHaveProperty("commissionPayoutCodeAdjustment");
    const rows = projectConfirmedCommissionCodes(visible, visible.commissionPayouts);
    const plan = acquisitionCommissionInstallments({ item: entry.items[0], product: entry.productKey, frequency: entry.frequencyRaw,
      policyStartDate: entry.policyStartDate, payouts: rows });
    expect(plan.map(part => [part.commissionPeriod, part.amount, payoutsForAcquisitionInstallment(rows, part).map(p => p.key)])).toEqual([
      ["2025-04-02", 12, ["first"]], ["2025-04-21", 100, ["full"]], ["2025-10-02", 100, []],
    ]);
    const paid = generateCashflow([visible], 2, writer, new Date(2025, 5, 1)).filter(item => item.payoutStatus === "paid");
    expect(paid).toHaveLength(2);
    expect(paid).toContainEqual(expect.objectContaining({ commissionPayoutKey: "first", commissionPeriodStart: "2025-04-02", amount: 12, isStatementOnly: true }));
    expect(paid).toContainEqual(expect.objectContaining({ commissionPayoutKey: "full", commissionPeriodStart: "2025-04-21", amount: 100, statementCode: "B101" }));
    expect(regular.code).toBe("B101");
    const other = filterStatementDerivedContractDataForViewer({ contract: entry, ownerEmail: writer, viewerEmail: "other@example.test", teamEmails: [] });
    expect(other.commissionPayouts).toEqual([]);
    expect(other).not.toHaveProperty("commissionPayoutCodeAdjustment");
  });

  it("requires the confirmed recipient, statement, row, amount and premium", () => {
    const project = createCommissionCodeProjection(entry, entry.commissionPayouts);
    for (const changed of [{ writtenBy: "other@example.test" }, { statementId: "later" }, { key: "other" },
      { status: "storno" }, { amount: 99 }, { sourceBaseAmount: 999 }]) {
      const receipt = { ...regular, ...changed };
      expect(project(receipt)).toBe(receipt);
    }
    const keyless = { code: "B101", statementId: "report", writtenBy: writer };
    expect(project(keyless).confirmedCollection?.dueDate).toBe("2025-04-21");
    expect(createCommissionCodeProjection(entry, [regular, { ...regular, key: "other" }])(keyless)).toBe(keyless);
    expect(projectConfirmedCommissionCodes({ ...entry, commissionPayoutCodeAdjustment: undefined }, [regular])[0]).toBe(regular);
  });
});
