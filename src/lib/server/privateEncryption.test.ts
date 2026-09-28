import "../../../tests/helpers/privateEncryptionTestKey";
import { describe, expect, it, vi } from "vitest";
import { sealPrivateValue, openPrivateValue } from "./privateEncryption";
import { encryptPrivateFile, decryptPrivateFile } from "./privateStorage";
import { planPrivateDataMigration } from "./privateDataMigration";
import { openTip, openTipMailbox } from "./tipEncryption";

describe("private data encryption and migration", () => {
  it("binds values to owner, document and field and rejects forged ciphertext", () => {
    const context = "clientCardsPrivate/author/cards/client:card";
    const original = { birthNumber: "synthetic-private-id", identityDocuments: [{ number: "private-doc" }] };
    const sealed = sealPrivateValue(original, context);
    expect(JSON.stringify(sealed)).not.toContain("synthetic-private-id");
    expect(openPrivateValue(sealed, context)).toEqual(original);
    for (const other of [context.replace("author", "other"), context.replace("client:", "another:"), context + ":text"]) {
      expect(() => openPrivateValue(sealed, other)).toThrow();
    }
    expect(() => openPrivateValue({ ...sealed, payload: { ...sealed.payload, ciphertext: "AAAA" } }, context)).toThrow();
    expect(() => openPrivateValue({ ...sealed, privateEncryption: 2 }, context)).toThrow();
  });
  it("fails closed without a server secret", () => {
    vi.stubEnv("MAILBOX_ENCRYPTION_KEY", "");
    expect(() => sealPrivateValue("secret", "context")).toThrow();
    expect(() => encryptPrivateFile(Buffer.from("secret"), "bucket", "file")).toThrow();
  });
  it("rejects plaintext and stripped file headers once migration compatibility is disabled", () => {
    vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true");
    expect(() => openPrivateValue({ private: "plaintext" }, "context")).toThrow();
    expect(() => decryptPrivateFile(Buffer.from("%PDF-legacy"), "bucket", "path")).toThrow();
    expect(() => openTipMailbox({ title: "unprotected tip" }, "id")).toThrow();
    const sealed = sealPrivateValue("protected", "context");
    expect(openPrivateValue(sealed, "context")).toBe("protected");
  });
  it("authenticates all file bytes and bucket/path before releasing plaintext", () => {
    const original = Buffer.from("%PDF-1.7\nprivate customer content");
    const encrypted = encryptPrivateFile(original, "bucket", "contract-pdfs/a/file");
    expect(encrypted.includes(original)).toBe(false);
    expect(decryptPrivateFile(encrypted, "bucket", "contract-pdfs/a/file")).toEqual(original);
    expect(() => decryptPrivateFile(encrypted, "bucket", "contract-pdfs/b/file")).toThrow();
    expect(() => decryptPrivateFile(encrypted, "another", "contract-pdfs/a/file")).toThrow();
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => decryptPrivateFile(encrypted, "bucket", "contract-pdfs/a/file")).toThrow();
  });
  it.each([
    ["clientCardsPrivate/owner/cards/client", "card", { ownerUid: "owner", card: { birthNumber: "private", email: "synthetic@test.invalid" }, revision: 2 }],
    ["clientCardsPrivate/owner/cards/client/clientNotes/note", "text", { ownerUid: "owner", text: "private", revision: 2 }],
    ["clientNoteReminders/id", "clientName", { ownerUid: "owner", clientName: "private", reminderAtMs: 123 }],
    ["documentDraftKeys/id", "key", { ownerUid: "owner", version: 1, key: "private" }],
  ])("migrates %s without losing values, metadata or idempotency", (path, field, source) => {
    const migrated = planPrivateDataMigration(path, source)!;
    expect(migrated).not.toBeNull();
    expect(JSON.stringify(migrated)).not.toContain('"private"');
    expect(openPrivateValue(migrated[field], `${path}:${field}`)).toEqual(source[field as keyof typeof source]);
    expect(planPrivateDataMigration(path, migrated)).toBeNull();
    expect(source[field as keyof typeof source]).not.toHaveProperty("privateEncryption");
  });
  it("rejects invalid ownership rather than assigning a card to another author", () => {
    expect(() => planPrivateDataMigration("clientCardsPrivate/other/cards/client", { ownerUid: "owner", card: {} })).toThrow();
  });
  it("migrates every tip copy and removes plaintext message previews", () => {
    const path = "usersPrivate/author@example.test/tipsterTips/id";
    const source = { title: "Client Jane", messageText: "Private phone 123", fields: [{ label: "Phone", value: "123" }], status: "pending" };
    const saved = planPrivateDataMigration(path, source)!;
    expect(JSON.stringify(saved)).not.toContain("Private phone");
    expect(openTip(saved, path)).toEqual(source);
    for (const direction of ["sent", "received"]) {
      const mailbox = `usersPrivate/${direction}/mailbox/id`;
      const message = planPrivateDataMigration(mailbox, { type: "direct_message", title: source.title, body: source.messageText, metadata: { messageId: "shared", messageText: source.messageText, tipsterTip: true, mailboxDirection: direction } })!;
      expect(JSON.stringify(message)).not.toContain("Private phone");
      expect(openTipMailbox(message, "id")).toMatchObject({ title: source.title, body: source.messageText });
      expect(planPrivateDataMigration(mailbox, message)).toBeNull();
    }
  });
  it("leaves unrelated collections and public records untouched", () => {
    expect(planPrivateDataMigration("users/a", { name: "Public card" })).toBeNull();
  });
});
