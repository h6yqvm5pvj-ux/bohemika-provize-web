import { describe, expect, it } from "vitest";
import { contractHistoryChanges, legacyContractHistory } from "./contractHistory";

describe("shared contract history", () => {
  it("records business changes with their previous and new values", () => {
    expect(contractHistoryChanges({ clientName: "Jan Novák", paid: false, pensionTargetAge: 60 }, { clientName: "Jan Novotný", paid: true, pensionTargetAge: 65 })).toEqual([
      { label: "Klient", before: "Jan Novák", after: "Jan Novotný" },
      { label: "Zaplaceno", before: "Ne", after: "Ano" },
      { label: "Cílový věk spoření", before: "60", after: "65" },
    ]);
  });
  it("does not record unchanged values, timestamp representations or object key ordering", () => {
    const date = new Date("2026-09-01T00:00:00Z");
    expect(contractHistoryChanges({ policyStartDate: { seconds: date.getTime() / 1000 }, note: null, neonDetail: { a: true, b: 3 } }, { policyStartDate: date, note: "", neonDetail: { b: 3, a: true } })).toEqual([]);
  });
  it("never copies private commissions, storage paths, indexes or audit pointers", () => {
    expect(contractHistoryChanges({}, { items: [{ amount: 999 }], total: 999, managerOverrides: [{ total: 888 }], commissionPayouts: [{ amount: 777 }], contractPdfAttachment: { storagePath: "private/file" }, searchTokens: ["x"], contractHistoryId: "forged" })).toEqual([]);
  });
  it("preserves stored transfers and notes without inventing missing dates or actors", () => {
    const result = legacyContractHistory({ ownershipTransferHistory: [{ fromEmail: "old@test.cz", toEmail: "new@test.cz", transferredAt: new Date("2025-01-01"), transferredByEmail: "admin@test.cz" }], note: "Starší poznámka" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "legacy", atMs: null, actorEmail: null });
    expect(result[0].changes[0]).toMatchObject({ before: "old@test.cz", after: "new@test.cz" });
    expect(result[0].changes[1].after).toBe("Starší poznámka");
    expect(legacyContractHistory({})).toEqual([]);
  });
});
