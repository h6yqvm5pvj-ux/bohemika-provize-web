import { describe, expect, it } from "vitest";
import { filterStatementDerivedContractDataForViewer } from "./contractsApi.statementVisibility";
import { normalizeCreateEntryPayload } from "./contractsApi.createPayload";
const owner = "adviser@example.test";
const contract = { productKey: "cppAuto" as const, frequencyRaw: "annual" as const,
  commissionPayoutCodeAdjustment: { kind: "cpp-auto-annual-sequence-offset" as const, writtenBy: owner, fromPayoutMonthKey: "2021-6", confirmedAtMs: 1 },
  commissionPayouts: [
    { key: "own", code: "A102", amount: 100, payoutMonthKey: "2021-6", writtenBy: owner },
    { key: "other", code: "B101", amount: 500, payoutMonthKey: "2021-6", writtenBy: "other@example.test" },
  ],
};
describe("commission code correction privacy", () => {
  it("projects only visible receipts and keeps the correction bound to its recipient", () => {
    const own = filterStatementDerivedContractDataForViewer({ contract, viewerEmail: owner, ownerEmail: owner, teamEmails: [] });
    expect(own.commissionPayouts).toEqual([expect.objectContaining({ key: "own", code: "B101", statementCode: "A102", amount: 100 })]);
    const foreign = filterStatementDerivedContractDataForViewer({ contract, viewerEmail: "other@example.test", ownerEmail: owner, teamEmails: [] });
    expect(foreign.commissionPayouts).toEqual([contract.commissionPayouts[1]]);
    const unrelated = filterStatementDerivedContractDataForViewer({ contract, viewerEmail: "unrelated@example.test", ownerEmail: owner, teamEmails: [] });
    expect(unrelated.commissionPayouts).toEqual([]);
    expect(contract.commissionPayouts[0].code).toBe("A102");
  });
  it("does not accept privileged correction metadata in contract creation input", () => {
    const result = normalizeCreateEntryPayload({ raw: { productKey: "cppAuto", entryType: "contract", inputAmount: 1000, frequencyRaw: "annual", commissionPayoutCodeAdjustment: contract.commissionPayoutCodeAdjustment }, ownerEmail: owner, ownerUid: "synthetic" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Nepovolená pole v entry: commissionPayoutCodeAdjustment");
  });
});
