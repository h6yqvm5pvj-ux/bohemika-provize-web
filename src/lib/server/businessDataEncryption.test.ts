import "../../../tests/helpers/privateEncryptionTestKey";
import { describe, expect, it, vi } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import {
  businessLookupToken, openBusinessRecord, sealBusinessRecord, planBusinessDataMigration,
} from "./businessDataEncryption";

const path = "users/owner@example.test/entries/one";
describe("business content at rest", () => {
  it("covers identities, original numbers, vehicle identifiers and all search/history copies", () => {
    const source = { clientName: "Sensitive Client", clientEmail: "sensitive@example.test", clientPhone: "Sensitive phone",
      clientAddress: "Sensitive address", contractNumber: "Sensitive-number", refreshOriginalContractNumber: "Sensitive-original",
      clientSearchKeys: ["Sensitive"], contractNumberSearchKeys: ["Sensitive-number"], duplicateLookupKey: "Sensitive-key",
      premiumStatementBaseResolutions: [{ contractNumber: "Sensitive-number", key: "Sensitive-key" }],
      carVin: "Sensitive-vin", carPlate: "Sensitive-plate", userEmail: "owner@example.test", inputAmount: 1200 };
    const stored = sealBusinessRecord(path, source);
    expect(JSON.stringify(stored)).not.toContain("Sensitive");
    expect(JSON.stringify(stored)).not.toContain("sensitive@example.test");
    expect(stored.userEmail).toBe(source.userEmail);
    expect(openBusinessRecord(path, stored)).toEqual(source);
    expect(sealBusinessRecord(path, source).clientName).not.toEqual(stored.clientName);
  });
  it("rejects record/field substitution and damaged ciphertext", () => {
    const stored = sealBusinessRecord(path, { clientName: "Sensitive", clientAddress: "Secret" });
    expect(() => openBusinessRecord(`${path}-other`, stored)).toThrow();
    expect(() => openBusinessRecord(path, { ...stored, clientName: stored.clientAddress })).toThrow();
    const envelope = stored.clientName as { ciphertext: Buffer };
    envelope.ciphertext[0] ^= 1;
    expect(() => openBusinessRecord(path, stored)).toThrow();
  });
  it("fails closed for missing keys, ciphertext writes and partial private transforms", () => {
    expect(() => sealBusinessRecord(path, { "clientAddress.city": "Sensitive" })).toThrow();
    expect(() => sealBusinessRecord(path, { clientSearchKeys: FieldValue.arrayUnion("Sensitive") })).toThrow();
    expect(() => sealBusinessRecord(path, sealBusinessRecord(path, { clientName: "Sensitive" }))).toThrow();
    vi.stubEnv("BUSINESS_DATA_INDEX_KEY", "");
    expect(() => sealBusinessRecord(path, { contractNumber: "12345" })).toThrow();
    vi.stubEnv("MAILBOX_ENCRYPTION_KEY", "");
    expect(() => sealBusinessRecord(path, { clientName: "Sensitive" })).toThrow();
  });
  it("preserves deletion of both content and its blind index", () => {
    const stored = sealBusinessRecord(path, { contractNumber: FieldValue.delete() });
    expect(stored.contractNumber).toEqual(FieldValue.delete());
    expect(stored._businessLookup_contractNumber).toEqual(FieldValue.delete());
  });
  it("covers contract copies in the actual tip payout and status collections", () => {
    for (const [copyPath, source] of [
      ["users/tipster@example.test/tipPayouts/one", { clientName: "Sensitive Client" }],
      ["usersPrivate/tipster@example.test/tipsterTips/one", { linkedContractNumber: "Sensitive-number" }],
      ["usersPrivate/advisor@example.test/advisorTipStatuses/one", { linkedContractNumber: "Sensitive-number" }],
    ] as const) {
      const sealed = sealBusinessRecord(copyPath, source);
      expect(JSON.stringify(sealed)).not.toContain("Sensitive");
      expect(openBusinessRecord(copyPath, sealed)).toEqual(source);
      const migrated = planBusinessDataMigration(copyPath, source)!;
      expect(openBusinessRecord(copyPath, migrated)).toEqual(source);
      expect(planBusinessDataMigration(copyPath, migrated)).toBeNull();
    }
  });
  it("keeps content-key rotation independent from private search indexes", () => {
    const stored = sealBusinessRecord(path, { contractNumber: "Sensitive-number" });
    const previous = process.env.MAILBOX_ENCRYPTION_KEY;
    const token = businessLookupToken("entries:contractNumber", "Sensitive-number");
    vi.stubEnv("MAILBOX_ENCRYPTION_PREVIOUS_KEYS", JSON.stringify({ "private-test": previous }));
    vi.stubEnv("MAILBOX_ENCRYPTION_KEY_ID", "rotated");
    vi.stubEnv("MAILBOX_ENCRYPTION_KEY", Buffer.alloc(32, 91).toString("base64"));
    expect(openBusinessRecord(path, stored).contractNumber).toBe("Sensitive-number");
    expect(businessLookupToken("entries:contractNumber", "Sensitive-number")).toBe(token);
    expect(businessLookupToken("other-domain", "Sensitive-number")).not.toBe(token);
  });
  it("migrates plaintext idempotently and gates legacy reads separately", () => {
    vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true");
    const legacy = { clientName: "Sensitive", contractNumber: "12345" };
    expect(openBusinessRecord(path, legacy)).toEqual(legacy);
    const migrated = planBusinessDataMigration(path, legacy)!;
    expect(planBusinessDataMigration(path, migrated)).toBeNull();
    vi.stubEnv("BUSINESS_DATA_ENCRYPTION_REQUIRED", "true");
    expect(() => openBusinessRecord(path, legacy)).toThrow();
    expect(openBusinessRecord(path, migrated)).toEqual(legacy);
  });
  it("seals the entire HTML and binary cached copies without base64 storage expansion", () => {
    const html = `<table>${"Sensitive contract 12345;".repeat(30_000)}</table>`;
    const statementPath = "usersPrivate/owner@example.test/commissionStatements/one";
    const stored = sealBusinessRecord(statementPath, { html, autoPremiumRows: [{ clientName: "Sensitive", contractNumber: "12345" }] });
    expect(JSON.stringify(stored)).not.toContain("Sensitive");
    expect(JSON.stringify(stored).length).toBeLessThan(30_000);
    expect(openBusinessRecord(statementPath, stored).html).toBe(html);
    const chunkPath = "_cashflowCandidateChunks/one";
    const bytes = Buffer.from(html);
    expect(openBusinessRecord(chunkPath, sealBusinessRecord(chunkPath, { bytes })).bytes).toEqual(bytes);
  });
});
