import "../../../tests/helpers/privateEncryptionTestKey";
import { describe, expect, it, vi } from "vitest";
import { openPrivateRecord, sealPrivateRecord } from "./privateRecords";
import { planPrivateDataMigration } from "./privateDataMigration";

const cases: [string, Record<string, unknown>][] = [
  ["users/a@example.test/entries/entry/contractNotes/n", { text: "Sensitive note", clientName: "Sensitive name", contractNumber: "Sensitive number", reminderEnabled: true }],
  ["users/a@example.test/entries/entry", { note: "Sensitive legacy" }],
  ["contractHistories/h/events/e", { title: "Sensitive title", changes: [{ before: "Sensitive old", after: "Sensitive new" }] }],
  ["anniversaryReviews/r", { privateReviewPath: "anniversaryReviews/r", note: "Sensitive review", meetingAt: "Sensitive meeting", contractNumber: "Sensitive contract" }],
  ["anniversaryReviewHistories/h/events/e", { note: "Sensitive earlier review", meetingAt: "Sensitive meeting" }],
  ["userRequests/r", { message: "Sensitive message", feedback: "Sensitive reply", requestedFullName: "Sensitive name", requesterEmail: "owner@example.test" }],
  ["mailboxSharedPayloads/p", { snapshot: { client: "Sensitive client" }, noteText: "Sensitive note", previewHtml: "Sensitive legacy html", senderName: "Sensitive name" }],
  ["usersPrivate/a@example.test/mailbox/m", { type: "production_export_share", title: "Sensitive title", body: "Sensitive body", metadata: { noteText: "Sensitive text", totalAnnual: 54321 } }],
];
describe("private record coverage and migration", () => {
  it.each(cases)("seals all content in %s and migrates it without leaving readable copies", (path, data) => {
    const sealed = sealPrivateRecord(path, data);
    expect(JSON.stringify(sealed)).not.toContain("Sensitive");
    expect(openPrivateRecord(path, sealed)).toEqual(data);
    const migrated = planPrivateDataMigration(path, data)!;
    expect(JSON.stringify(migrated)).not.toContain("Sensitive");
    expect(openPrivateRecord(path, migrated)).toEqual(data);
    expect(planPrivateDataMigration(path, migrated)).toBeNull();
    expect(() => openPrivateRecord(`${path}-other`, { ...sealed, ...(path.startsWith("anniversaryReviews/") ? { privateReviewPath: `${path}-other` } : {}) })).toThrow();
    vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true");
    expect(() => openPrivateRecord(path, data)).toThrow();
    expect(openPrivateRecord(path, sealed)).toEqual(data);
  });
  it("keeps the inline note readable across transfers using its stable location", () => {
    const original = "users/a@example.test/entries/entry";
    const transferred = { ...sealPrivateRecord(original, { note: "Sensitive legacy" }), contractNotesPath: original };
    expect(openPrivateRecord("users/b@example.test/entries/entry", transferred).note).toBe("Sensitive legacy");
    expect(() => openPrivateRecord("users/b@example.test/entries/entry", { ...transferred, contractNotesPath: "users/c@example.test/entries/entry" })).toThrow();
  });
  it("rejects field substitution, corrupt ciphertext and missing keys", () => {
    const path = "userRequests/r";
    const sealed = sealPrivateRecord(path, { message: "Sensitive message", feedback: "Sensitive reply" });
    expect(() => openPrivateRecord(path, { ...sealed, feedback: sealed.message })).toThrow();
    expect(() => openPrivateRecord(path, { ...sealed, message: { privateEncryption: 1, payload: {} } })).toThrow();
    vi.stubEnv("MAILBOX_ENCRYPTION_KEY", "");
    expect(() => sealPrivateRecord(path, { message: "Sensitive message" })).toThrow();
  });
});
